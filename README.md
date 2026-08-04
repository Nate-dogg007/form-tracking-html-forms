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
| City | `address.city` | no — explicit `data-upd` only |
| Region / county / state | `address.region` | no — explicit `data-upd` only |
| Postcode / zip | `address.postal_code` | no |
| Country | `address.country` | no |

Google needs at least an email, a phone number, or a complete address (first name, last name,
postal code and country). If none of those are present the `user_data` object is dropped and
you get a bare `form_submit`.

Field names are matched exactly against the allowlist, retried at each level as common prefixes
are stripped. So `your-email`, `billing_email` and `email` all resolve to email, Elementor's
`form_fields[email]` and Shopify's `address[zip]` resolve too, and `address_1` still resolves to
street because it matches before `address` is treated as a prefix. `company_name` resolves to
nothing and is dropped. A single `name` field is split on whitespace into first and last.

Never collected, regardless of what it is called: anything of `type="password"`, anything with
`autocomplete="cc-*"`, and anything that is not an `input`, `select` or `textarea`. Hidden fields
are skipped too, because they are populated by the site rather than the visitor, and CRM forms
routinely carry a hidden owner or assigned-rep email that would otherwise be hashed and reported
as the person who submitted. Use `data-upd` to opt a hidden field in deliberately.

By default, a form containing a password field has no fields read at all. It still produces a
bare `form_submit` with the form id and name, so a login is counted as an event but never as
identifiable data.

**`city` and `region` are never matched by field name.** They reach Google unhashed, and no
name-based rule can separate "Hampshire" from "cancer" — a shape check that rejects a long
sentence still lets "HIV positive" through, and a field called `state` is not always a US state
("please state your requirements"). Google needs them only alongside a full address, which
already requires first name, last name, postcode and country, so the match-rate cost is close to
nil. Collect them with an explicit `data-upd="city"` / `data-upd="region"` if you want them.

Also never matched: `form_name`, `form_title`, `field_name`, `user_name` and `username`. Several
WordPress form plugins ship a `form_name` field holding the form's own title, which would
otherwise be split and hashed as the visitor's name. That is worse than over-collecting, because
it poisons the match data with something that is not a person.

## Install

You paste the **whole `html-forms` file** into a GTM Custom HTML tag. Then you do it a second
time into a second tag, and change one line. The two tags hold the same script; the only
difference is one `false` becoming `true`.

The top of the file has a config block that looks like this:

```js
/* ══ CONFIG ══════════════════════════════════════════════════════════ */

// false = Tag A (base) · true = Tag B (user-provided data)
var COLLECT_USER_DATA = false;

// ISO 3166-1 alpha-2 for your primary audience...
var DEFAULT_COUNTRY = 'GB';
...
```

That is the line you edit. Everything else stays as it is.

### Tag A — "Form tracking (base)"

1. Tags → New → Tag Configuration → **Custom HTML**.
2. Open `html-forms`, copy **all of it** (including the `<script>` tags at the top and bottom),
   and paste it into the HTML box.
3. Leave `var COLLECT_USER_DATA = false;` exactly as it is.
4. Set `var DEFAULT_COUNTRY` to the right country for this site. See below.
5. Triggering → **All Pages**.
6. Advanced Settings → Consent Settings → **No additional consent required**.
7. Save.

This tag pushes `form_submit` with the form id and form name, and nothing else. No field values,
so there is nothing to gate. There is deliberately no page path either: GTM already exposes
`{{Page Path}}`, and on a site that puts identifiers in the URL (`/account/<email>/reset`)
copying it here would push personal data through the one tag that has no consent requirement.

### Tag B — "Form tracking (user-provided data)"

1. Tags → New → Tag Configuration → **Custom HTML**.
2. Paste **the same whole file again**.
3. Change that one line to `var COLLECT_USER_DATA = true;`.
4. Set `var DEFAULT_COUNTRY` to the same value you used in Tag A.
5. Triggering → **All Pages**.
6. Advanced Settings → Consent Settings → **Require additional consent for tag to fire**, and
   add `ad_user_data` and `ad_storage`.
7. Save.

This tag pushes `form_submit` with the `user_data` object attached.

### What happens then

Both tags fire on every page, but only one `form_submit` event is produced per submission. When
Tag B is present it emits the enriched event and Tag A stays silent, so you build **one** trigger
and **one** Google Ads tag and there is nothing to de-duplicate.

If your CMP has not granted `ad_user_data`, GTM never runs Tag B, so Tag A's plain event is what
fires. Grant consent and Tag B takes over from that point on.

### Why two tags rather than one

So that the code which reads personal data out of a form is not even present on the page until
consent exists. The script also re-checks consent on every submission (see below), so a single
tag with `COLLECT_USER_DATA = true` and no GTM consent setting would behave correctly too. Two
tags means two independent gates instead of one, and an earlier version of the runtime check was
found to fail open in seven different ways during review — which is the argument for not making
it the only thing standing between a visitor and their data. Use one tag if you would rather keep
the container simple; use two if you want the belt and braces. The README assumes two.

### Check this one setting

```js
var DEFAULT_COUNTRY = 'GB';
```

This converts national phone formats to E.164. Get it wrong and every hashed phone number
silently fails to match, with no error anywhere. Numbers already in international format
(`+44...`, `0044...`) are used as they are, so it only matters for people typing `07700 900123`.
Extend `DIAL_CODES` if your country is not listed.

`COUNTRY_ALIASES` does the same job for country dropdowns holding names rather than ISO codes. A
country value that is neither two letters nor a listed alias is dropped rather than sent as a
guess.

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

**It fails closed.** A grant has to be positive and unambiguous. No consent signal, an
unreadable shape, a dataLayer that has been reset, a `default` arriving after an `update`, a
region-scoped entry for somewhere else: all of those resolve to denied, not granted. An earlier
draft defaulted to granted on anything it could not read, which meant a CMP whose updates never
reached the dataLayer in the expected shape looked exactly like consent. A control that fails
open while its documentation says it fails closed is worse than no control at all.

The practical consequence: **if you are not running Consent Mode v2, Tag B collects nothing.**
It logs one console warning saying so, because silence here is indistinguishable from working.
Set `REQUIRE_EXPLICIT_CONSENT = false` only if you have another lawful basis and know what it is.

If your CMP does something the dataLayer does not reflect, set `window.formTrackingConsentFn` to
a function returning `true` when user data may be collected. Anything else, including `undefined`,
is denied, because the natural way to write a CMP adapter returns nothing on its deny branch. A
function that throws is denied too.

**Withdrawal is forward-only.** It stops further collection; it cannot retract what is already
there. Anything pushed before withdrawal stays readable to other tags for the life of that page
view, and only a page load clears it.

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
`city`, `region`, `postal_code`, `country`, and `ignore` to exclude a field. `city` and `region`
are only ever collected this way.

It is also how you opt in a hidden field, which matters for the mirror pattern: where a visible
input is decorative and the real value is written to a hidden one, as intl-tel-input and most
styled selects and multi-step forms do. Without `data-upd` that value is skipped and you lose the
field silently. Check whose data a hidden field holds before opting it in — the site chooses its
value, not the visitor, so a hidden CRM owner field is not the person who filled the form.

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

110 assertions, 15 of which fail against the previous commit alone. Run it after editing the
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
