# HTML form tracking for Google Ads enhanced conversions

Author: Nathan O'Connor
Version: 1.2

Captures native HTML form submissions, normalises and SHA-256 hashes the user-provided data
fields Google Ads wants, and pushes one `html_form_submit` event to the dataLayer. Personal data is
only ever read once your CMP has granted `ad_user_data`, re-checked on every submission.

**Install is one GTM Custom HTML tag.** Paste the file in, set one country code, trigger on All
Pages. Nothing to toggle.

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
- The event is now `html_form_submit`, not `form_submission_hashed`.

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
you get a bare `html_form_submit`.

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
bare `html_form_submit` with the form id and name, so a login is counted as an event but never as
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

One GTM tag. Five minutes.

1. **Tags → New → Tag Configuration → Custom HTML.**
2. Open the `html-forms` file in this repo, select **all of it**, and paste it into the HTML box.
   Include the `<script>` and `</script>` lines at the top and bottom.
3. Near the top you will see a short config block. Change one value:

   ```js
   var DEFAULT_COUNTRY = 'GB';
   ```

   Set it to the country most of this site's visitors are in. This is the only value you normally
   need to touch, and it is the one that quietly ruins everything if it is wrong — see below.
4. **Triggering → All Pages.**
5. Name it something like `Form tracking` and **Save**.

That is the whole install. There is nothing to toggle, no second tag, and no consent setting to
configure on this tag: the script checks consent itself, on every submission.

### Why DEFAULT_COUNTRY matters

It turns national phone formats into the E.164 format Google requires. `07700 900123` has to
become `+447700900123` before it is hashed, and that conversion needs to know the country.

Get it wrong and every hashed phone number fails to match. Google reports no error for this. You
will see the tag firing correctly in Preview and simply get a poor match rate forever.

Numbers already written internationally (`+44…`, `0044…`) are used as they are, so this only
affects people typing the local format. If your country is not in the `DIAL_CODES` list, add it.

`COUNTRY_ALIASES` does the same job for country dropdowns holding names (`United Kingdom`)
rather than codes (`GB`). A value that is neither two letters nor a listed alias is dropped
rather than sent as a guess.

### If you edit the script

Never put `{{ ... }}` in it. GTM substitutes that syntax anywhere in a Custom HTML tag, including
inside JavaScript comments, because it does not parse the JS. A `{{Page Path}}` in a comment
shipped in v1.2 and GTM rejected the tag as referencing an unsupported variable. The test suite
now fails on any occurrence.

### Optional hardening

If you would rather the script were not on the page at all before consent, add
**Consent Settings → Require additional consent for tag to fire → `ad_user_data`** to this tag.
It still works the same way; GTM just holds the tag back until consent exists, and fires it on
the consent update.

This is genuinely optional. Without it the script is present but reads nothing, because the
consent check runs before any field is touched.

## Consent

**First, what this is not for.** Google Ads already refuses to transmit user-provided data when
`ad_user_data` is denied — that is built into the tag, and you do not need this script to make it
happen. The consent gate here is not protecting the transmission to Google.

What it protects is `window.dataLayer`. Hashing someone's email and pushing it there discloses it
to every other tag in the container and every third-party script on the page: session recorders,
chat widgets, someone else's pixel. That happens before Google Ads gets a say, and Google's own
consent handling does nothing about it. A GTM tag-level consent check does not help either,
because it gates the tag rather than a push that has already happened.

So the gate is on the payload, and it has two properties worth knowing.

**It is checked per submission, not once.** A GTM tag-level consent check happens when GTM
decides whether to run the tag, and that decision does not get revisited. The listener installed
here lives for the rest of the page, so consent is re-read at the moment it matters: on every
submission, before a single field is touched.

Granted, and `html_form_submit` carries `user_data`. Denied, and `html_form_submit` fires with the form id
and name only. Someone who withdraws consent halfway through a session stops being read from
immediately, rather than at their next page load.

**It fails closed.** A grant has to be positive and unambiguous. No consent signal, an
unreadable shape, a dataLayer that has been reset, a `default` arriving after an `update`, a
region-scoped entry for somewhere else: all of those resolve to denied, not granted. An earlier
draft defaulted to granted on anything it could not read, which meant a CMP whose updates never
reached the dataLayer in the expected shape looked exactly like consent. A control that fails
open while its documentation says it fails closed is worse than no control at all.

The practical consequence: **if you are not running Consent Mode v2, no user data is collected.**
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

Seven steps, in this order. Step 1 first, because until it is done Google discards everything the
rest of this sends and tells you nothing.

Names in backticks are what to type. Keep them exactly as written and the later steps will
reference variables that already exist.

---

### Step 1 — Turn on enhanced conversions in Google Ads

Not in GTM. In Google Ads itself.

1. **Goals → Conversions → Summary**, and click the conversion action you want to enhance.
2. **Settings → Enhanced conversions.**
3. Tick **Turn on enhanced conversions** and accept the terms.
4. For the setup method choose **Google Tag Manager**.

If you skip this, everything below will look correct in Preview and Google will silently throw
the data away.

---

### Step 2 — Three Data Layer Variables

**Variables → User-Defined Variables → New → Data Layer Variable.** Create all three.

| Name it | Data Layer Variable Name |
|---|---|
| `DLV - user_data` | `user_data` |
| `DLV - form_id` | `form_details.form_id` |
| `DLV - form_name` | `form_details.form_name` |

In each one, open **Additional Settings** and set **Data Layer Version** to **Version 2**. The
values are nested objects and Version 1 will not reach into them.

---

### Step 3 — The User-Provided Data variable

**Variables → New → Variable Configuration → User-Provided Data.**

1. Under **Type**, choose **Code**, not Manual configuration.
2. In **Variable**, select `{{DLV - user_data}}`.
3. Name it `UPD - form user data`.

If the picker refuses a Data Layer Variable, create a **Custom JavaScript** variable named
`CJS - user data` containing the below, and point the User-Provided Data variable at that instead:

```js
function () {
  return {{DLV - user_data}};
}
```

Code mode takes the whole object in one go, which is why this is one variable rather than the ten
the old setup needed. The script already emits exactly the shape Google expects:

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
    "postal_code": "so99 9xx",
    "country": "GB"
  }
}
```

---

### Step 4 — The trigger

**Triggers → New → Trigger Configuration → Custom Event.**

1. **Event name:** `html_form_submit`
2. Choose **Some Custom Events**.
3. Set the condition to `{{DLV - form_id}}` **equals** your enquiry form's id — or
   `{{DLV - form_name}}` **contains** something like `contact`.
4. Name it `CE - html_form_submit (leads)`.

**Do not use "All Custom Events" here.** The script listens to every form on the site, so a bare Custom Event trigger counts all of them. Site search, logins, newsletter signups and
filter forms would all be counted as conversions. If you genuinely want every form, use All
Custom Events knowingly rather than by default.

Not sure what your form's id or name is? Do step 6 first with a temporary All Custom Events
trigger, read the values off the event, then come back and add the condition.

---

### Step 5 — The Google Ads conversion tag

**Tags → New → Tag Configuration → Google Ads Conversion Tracking.**

1. **Conversion ID** and **Conversion Label** — from the conversion action in step 1.
2. Tick **Include user-provided data from your website**, and select `UPD - form user data`.
3. **Advanced Settings → Consent Settings → Require additional consent for tag to fire**, and add
   `ad_storage`.
4. **Triggering:** the trigger from step 4.
5. Name it `Google Ads - Lead conversion` and save.

The `ad_storage` requirement is not optional. The script's consent gate governs reading personal
data out of a form; it has no say over this tag, which writes `_gcl` cookies and needs consent in
its own right under PECR.

One tag covers both consent states. When consent was denied, `{{DLV - user_data}}` is simply
undefined and the conversion fires without enhanced data, which is what you want.

---

### Step 6 — Preview and check

**Preview**, load the site, submit a test form.

In the Tag Assistant window:

1. Find `html_form_submit` in the event list on the left. Not there? The script is not running, or
   something on the page is breaking before it. See "If no event fires" below.
2. Click the event, then the **Variables** tab. `{{DLV - user_data}}` should hold an object with
   `sha256_email_address` and an `address` block.
3. Check the **Tags** tab shows `Google Ads - Lead conversion` fired.

**If the event fires but `user_data` is empty**, consent is being read as denied. Open the browser
console — the script logs one warning explaining exactly that. It fails closed, so no readable
`ad_user_data` signal means no user data, deliberately.

---

### Step 7 — Publish, then confirm properly

Submit the container.

GTM Preview proves the event fires and the tag runs. It does **not** prove Google accepted or
matched the data. For that, go back to **Goals → Conversions**, click the conversion action, and
look at the **Enhanced conversions diagnostics** panel. It takes a day or two to populate and it
is the only honest confirmation that any of this worked.

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

Open GTM Preview, submit a form, and look for `html_form_submit`. Check that `user_data` is present
with your consent granted and absent with it denied. Set `var DEBUG = true;` in the script for
console output while you are working.

The repo has an end to end suite that runs the real script in Chromium against real forms,
covering the normalisation rules, the consent split, password exclusion and E.164 conversion:

```bash
npm install playwright
node test/form-tracking.test.mjs
```

108 assertions. Run it after editing the
script. It has caught every real defect found in this rewrite so far, including the two most
serious: the script overriding another handler's `preventDefault()` and force-submitting a form
the site had cancelled, and personal data still being collected after consent was withdrawn.

## Requirements and limits

- Standard HTML form submissions. AJAX and JavaScript-rendered forms are not tracked: the script
  sees the cancellation and stands down, so they keep working normally but produce no event. Use the
  Ninja Forms or Gravity Forms scripts instead. Those are still on the older approach and carry
  the phone and postcode problems described above until they are updated.
- HTTPS. `crypto.subtle` only exists in a secure context, so on plain HTTP the tag still reports
  submissions but never attaches `user_data`.
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
