# HTML form tracking for Google Ads enhanced conversions

Author: Nathan O'Connor
Version: 1.2

Captures native HTML form submissions, normalises and SHA-256 hashes the user-provided data
fields Google Ads wants, and pushes one `form_submit` event to the dataLayer. Personal data is
only ever read once your CMP has granted `ad_user_data`.

This feeds **Google Ads enhanced conversions only**. Do not put the hashed fields into GA4 event
parameters or custom dimensions: that is what
[Best practices to avoid sending PII](https://support.google.com/analytics/answer/6366371)
prohibits, and hashing does not exempt you from it, because hashed data is pseudonymous rather
than anonymous and remains personal data under UK GDPR
([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/pseudonymisation/)).

If you do want this data in GA4, there is a supported route:
[user-provided data collection](https://support.google.com/analytics/answer/14077171), which is a
separate opt-in feature with its own policy acknowledgement and an Ads link. This script does not
target it. Use event parameters for that and you are breaking the rules; use the official feature
and you are not.

## If you are upgrading from 1.0 or 1.1

1.2 is a rewrite, not a patch. You will need to redo the GTM setup. The short version of why:

- **Postcode and country were being hashed. They must be sent in the clear.** Google requires
  first name, last name, postal code and country together for address matching, so hashing two
  of the four did not weaken address matching, it broke it.
- **Phone numbers were never converted to E.164.** `07700 900123` was hashed as typed, which
  can never match a Google record. Enhanced conversions fails silently, so there was no signal
  that anything was wrong.
- **Any field with "name" in it was hashed**, including `company_name`, so the `contact_name`
  and `company_name` variables the old README told you to create were always undefined.
- **Unrecognised fields were pushed in plain text**, message boxes included. A password field
  called anything other than exactly `password` went into the dataLayer as typed.
- **The hash raced the page unload.** Native form submission navigates immediately, so the
  event often never landed. It looked fine in Preview on a fast connection.
- The event is now `form_submit`, not `form_submission_hashed`.

## What it collects

An allowlist. Only these fields ever leave the page, and everything else is discarded: message
boxes, free text, company names, anything unrecognised.

| Field | Sent as | Hashed |
|---|---|---|
| Email | `sha256_email_address` | yes |
| Phone | `sha256_phone_number` | yes |
| First name | `address.sha256_first_name` | yes |
| Last name | `address.sha256_last_name` | yes |
| Street | `address.sha256_street` | yes |
| City | `address.city` | no |
| Region / county / state | `address.region` | no |
| Postcode / zip | `address.postal_code` | no |
| Country | `address.country` | no |

Google needs at least an email, a phone number, or a complete address (first name, last name,
postal code and country). If none of those are present the `user_data` object is dropped and
you get a bare `form_submit`.

Field names are matched exactly after a common prefix is stripped, so `your-email`,
`billing_email` and `email` all resolve to email. `company_name` does not resolve to anything
and is dropped. A single `name` field is split on whitespace into first and last.

Never collected, regardless of what it is called: anything of `type="password"`, anything with
`autocomplete="cc-*"`, and anything that is not an `input`, `select` or `textarea`. Hidden fields
are skipped too, because they are populated by the site rather than the visitor, and CRM forms
routinely carry a hidden owner or assigned-rep email that would otherwise be hashed and reported
as the person who submitted. Use `data-upd` to opt a hidden field in deliberately.

By default, a form containing a password field has no fields read at all. It still produces a
bare `form_submit` with the form id and name, so a login is counted as an event but never as
identifiable data.

`city` and `region` are the only free-text fields sent unhashed, so they are shape-checked before
being passed through: anything over 60 characters, containing an `@`, running to more than four
words or holding a long digit run is dropped. A field named `state` is not always a US state.

## Install

The script goes into GTM twice, as two Custom HTML tags. One line differs between them.

### Tag A: form tracking (base)

```js
var COLLECT_USER_DATA = false;
```

- Trigger: All Pages
- Consent Settings: no additional consent required

Pushes `form_submit` with the form id, form name and page path. No personal data, so there is
nothing to gate.

### Tag B: form tracking (user-provided data)

```js
var COLLECT_USER_DATA = true;
```

- Trigger: All Pages
- Consent Settings: **Require additional consent for tag to fire** → `ad_user_data`, `ad_storage`

Pushes `form_submit` with the `user_data` object attached.

Exactly one `form_submit` fires per submission. When Tag B is running it emits the enriched
event and Tag A stays silent, so there is nothing to de-duplicate: one trigger, one Google Ads
tag.

### Check this one setting

```js
var DEFAULT_COUNTRY = 'GB';
```

This converts national phone formats to E.164. Get it wrong and every hashed phone number
silently fails to match. Numbers already in international format (`+44...`, `0044...`) are used
as they are, so this only matters for people typing `07700 900123`. Extend `DIAL_CODES` if your
country is not listed.

`COUNTRY_ALIASES` does the same job for country dropdowns that hold names rather than ISO
codes. A country value that is neither two letters nor a listed alias is dropped rather than
sent as a guess.

## Consent

The listener itself sets no cookies and sends nothing, so it belongs on all pages. Hashing
someone's email and putting it in `window.dataLayer` is different: that is processing personal
data for advertising, and once it is in the dataLayer any other tag or third-party script on
the page can read it.

Tag-level consent checks in GTM do not help with that, because they gate the tag, not a push
that has already happened. So the gate is on the payload, in two places.

**Before consent.** GTM will not run Tag B until your CMP grants `ad_user_data`, the Consent Mode
v2 signal for sending user-provided data to Google for advertising. Until then nothing personal
is read, hashed or pushed. If consent is granted part way through a session GTM fires Tag B on
the consent update, and a form submitted before that point produces the base event only.

**After withdrawal.** GTM checks consent once, when it decides whether to run the tag. That is
not enough on its own, because the listener Tag B installs lives for the rest of the page. So the
script re-checks `ad_user_data` on every submission, reading the last consent `default` or
`update` in the dataLayer, and falls back to the base payload when it has been withdrawn.
Without that, someone who withdrew consent mid-session would carry on having their data read and
hashed until they navigated away.

If your CMP does something the dataLayer does not reflect, set `window.formTrackingConsentFn` to
a function returning `false` when user data must not be collected. It overrides the dataLayer
check, and a function that throws is treated as denied.

Consent for the Google Ads conversion tag itself is a separate matter, covered below.

## GTM setup

### 1. Data Layer Variables

You need three. Variables → New → Data Layer Variable.

| Variable name | Data Layer Variable Name |
|---|---|
| `DLV - user_data` | `user_data` |
| `DLV - form_id` | `form_details.form_id` |
| `DLV - form_name` | `form_details.form_name` |

Set Data Layer Version to 2 so the nested object resolves.

### 2. User-Provided Data variable

Variables → New → User-Provided Data, and choose **Code** rather than Manual configuration.
Point it at `{{DLV - user_data}}`. If the picker will not take a Data Layer Variable directly,
wrap it in a Custom JavaScript variable:

```js
function () {
  return {{DLV - user_data}};
}
```

Code mode takes the whole object at once, which is why there is one variable here instead of
the ten the old README asked for. The script already emits Google's expected shape:

```js
{
  "sha256_email_address": "...",
  "sha256_phone_number": "...",
  "address": {
    "sha256_first_name": "...",
    "sha256_last_name": "...",
    "sha256_street": "...",
    "city": "southampton",
    "region": "hampshire",
    "postal_code": "so999xx",
    "country": "GB"
  }
}
```

### 3. Google Ads conversion tag

- Tag type: Google Ads Conversion Tracking
- Conversion ID and Label: from your Google Ads conversion action
- Include user-provided data: select the User-Provided Data variable from step 2
- Trigger: Custom Event = `form_submit`
- Consent Settings: **Require additional consent** → `ad_storage`

One tag covers both cases. If Tag B never ran, `{{DLV - user_data}}` is undefined and the
conversion fires without enhanced data, which is what you want.

The `ad_storage` requirement on this tag is not optional. The script's consent gate governs
reading personal data out of the form; it has no say over the conversion tag, which writes `_gcl`
cookies and needs consent in its own right under PECR.

**Put a condition on the trigger.** The script listens to every form on the site, so a bare
Custom Event trigger will count site search, login, newsletter signups and filter forms as
conversions. Add a condition on `{{DLV - form_id}}` or `{{DLV - form_name}}` naming the forms
that are genuinely leads. Relying on `data-no-track` across every other form means editing markup
you may not control.

Enhanced conversions also has to be switched on in Google Ads itself, under Goals →
Conversions → Settings.

## Fields the script cannot guess

Some form builders generate names nothing can match, WPForms `wpforms[fields][1]` being the
usual offender. Add `data-upd` to the input:

```html
<input name="wpforms[fields][1]" data-upd="email">
<input name="wpforms[fields][3]" data-upd="phone_number">
```

Accepted values: `email`, `phone_number`, `first_name`, `last_name`, `full_name`, `street`,
`city`, `region`, `postal_code`, `country`, and `ignore` to exclude a field.

`data-upd` overrides everything, so it also works to correct a field the script has matched
wrongly.

## Opting out

Add `data-no-track` to a form to skip it entirely, or to a single input to skip that field.

```html
<form id="internal-search" data-no-track>
```

Worth doing on internal search, login and anything handling payment.

## Testing

Open GTM Preview, submit a form, and look for `form_submit`. Check that `user_data` is present
with your consent granted and absent with it denied. Set `var DEBUG = true;` in the script for
console output while you are working.

The repo has an end to end suite that runs the real script in Chromium against real forms,
covering the normalisation rules, the consent split, password exclusion and E.164 conversion:

```bash
npm install playwright
node test/form-tracking.test.mjs
```

96 assertions, 23 of which fail against 1.1 and the first draft of 1.2. Run it after editing the
script. It has caught every real defect found in this rewrite so far, including the two most
serious: the script overriding another handler's `preventDefault()` and force-submitting a form
the site had cancelled, and personal data still being collected after consent was withdrawn.

## Requirements and limits

- Standard HTML form submissions. AJAX and JavaScript-rendered forms are not tracked: the script
  sees the cancellation and stands down, so they keep working normally but produce no event. Use the
  Ninja Forms or Gravity Forms scripts instead. Those are still on the older approach and carry
  the phone and postcode problems described above until they are updated.
- HTTPS. `crypto.subtle` only exists in a secure context, so Tag B does nothing on plain HTTP.
- Inputs need a `name` attribute or a `data-upd` attribute.
- The script holds every submission until GTM reports its tags have fired, capped at
  `MAX_DELAY_MS` (1200ms default). This applies whether or not consent was granted: a conversion
  pixel that has not left the browser before the page unloads is a lost conversion. The form
  always submits, timeout or not.
- Submissions are caught in the bubble phase on `window`, which runs after every `document`
  listener whatever order they registered in. That is deliberate: anything cancelling the
  submission must win, even a delegated handler added after the GTM container. The cost is that a
  handler calling `stopPropagation()` hides the submission from the script entirely. Losing a
  conversion beats breaking a form.
- `DEFAULT_COUNTRY` also drives `KEEP_TRUNK_ZERO`, the short list of countries where the national
  leading zero belongs in the E.164 number. Italy is on it: `06 1234 5678` is `+390612345678`,
  not `+39612345678`. Check your market before trusting the list.
- `HTMLFormElement.prototype.submit` is patched once so programmatic submissions are caught.
  This defers the call slightly, which will matter if your code does something immediately
  after calling `submit()`.

## Files

- `html-forms`: the script, paste into a GTM Custom HTML tag
- `test/form-tracking.test.mjs`: the test suite

Questions, or need the Ninja Forms or Gravity Forms version:
[info@nathanoconnor.co.uk](mailto:info@nathanoconnor.co.uk)
