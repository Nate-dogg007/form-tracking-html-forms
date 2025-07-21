
# 🧩 HTML Form Tracking & Hashing Script for Google Tag Manager

This script tracks **standard HTML form** submissions, hashes sensitive fields (like email and phone), and pushes a `form_submission_hashed` event into the `dataLayer`. It is ideal for use with **Google Tag Manager**, **Google Ads Enhanced Conversions**, and **Google Analytics 4** (GA4).

---

## 📌 Features

- 🔒 Hashes `email` and `phone` fields using **SHA-256**
- 🧼 Normalizes field names to `lowercase_with_underscores`
- 🔎 Captures all `input`, `textarea`, and `select` values on form submission
- 📊 Pushes a `form_submission_hashed` event to `dataLayer`
- 🚫 Skips fields like passwords or credit cards (defined in exclusion list)
- 🧠 Works for both normal and JavaScript-triggered form submissions

---

## 📂 Files

- `form-tracking.js` — the script to add via GTM or self-host (e.g. GitHub Pages, Cloudflare)

---

## 🚀 Installation Instructions

### ✅ Step 1: Add Script to Google Tag Manager

1. Go to your GTM container.
2. Navigate to **Tags → New → Tag Configuration** → select **Custom HTML**.
3. Paste in the contents of `form-tracking.js`.
4. Tick ✅ “Support document.write” (if prompted).
5. Set **Trigger** to **All Pages** (or restrict to form-specific pages).
6. Save and **Publish**.

---

### 🛠 Step 2: Create Data Layer Variables in GTM

| GTM Variable Name     | Data Layer Variable Name         |
|-----------------------|----------------------------------|
| `form_name`           | `form_details.form_name`         |
| `form_id`             | `form_details.form_id`           |
| `contact_name`        | `form_data.contact_name`         |
| `company_name`        | `form_data.company_name`         |
| `hashed_email`        | `form_data.hashed_email`         |
| `hashed_phone`        | `form_data.hashed_phone`         |

🔍 Use **Preview Mode** in GTM to inspect the event and confirm variable names.

---

### 📤 Step 3: Send to GA4 or Google Ads

#### ➤ GA4 Event Tag

- Tag Type: **GA4 Event**
- Event Name: `form_submission_hashed`
- Parameters:
  - `form_name`: `{{form_name}}`
  - `form_id`: `{{form_id}}`
  - `contact_name`: `{{contact_name}}`

#### ➤ Google Ads Enhanced Conversions

- In your **Google Ads Conversion Tag**:
  - Enable **Enhanced Conversions**
  - Toggle to use **dataLayer**
  - Map:
    - `Email` → `{{form_data.hashed_email}}`
    - `Phone` → `{{form_data.hashed_phone}}`

---

## 🧪 Testing

1. Use GTM **Preview Mode**
2. Submit a form
3. Check for `form_submission_hashed` in the debug panel
4. Expand `form_details` and `form_data` to verify values

---

## 📋 Requirements

- HTML forms must use native `<form>` element
- All input fields should have `name` attributes
- Works with non-AJAX (normal) forms or those that use `.submit()`
- Browser must support `window.crypto.subtle` API (most modern browsers)

---

## ⚠️ Notes

- Does **not** support AJAX-only forms (e.g. Ninja Forms) — use the Ninja version for those
- Does **not** work with React/Vue or SPA frameworks by default
- Script does not collect or send data without form submission
- Ensure your cookie and consent policies are aligned with GDPR and other regulations

---

**Author:** Nathan O’Connor
