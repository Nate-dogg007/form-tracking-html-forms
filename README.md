# 📩 HTML Form Tracking & Hashing Script

> Author: **Nathan O'Connor**  
> Version: 1.1  
> Purpose: Track HTML form submissions and push normalized, hashed values to the `dataLayer` for GA4 and Google Ads Enhanced Conversions using User-Provided Data.

---

## ✅ What This Script Does

- Listens for **native HTML form submissions** (non-AJAX).
- Extracts all `<input>`, `<select>`, and `<textarea>` values.
- **Hashes sensitive fields** (email, phone, name, address, etc.) using SHA-256.
- Normalizes keys: lowercase + underscores.
- Pushes a `form_submission_hashed` event into the `dataLayer`.
- Enables support for Google Tag Manager, GA4, and Google Ads Enhanced Conversions.

---

## ⚙️ Installation in Google Tag Manager (GTM)

### 📄 Step 1: Add the Script to GTM

1. In GTM, go to **Tags > New > Tag Configuration > Custom HTML**.
2. Paste the script contents (`form-tracking.js`).
3. Enable **"Support document.write"** if prompted.
4. **Trigger:** Fire on "All Pages" or only on pages with your form.
5. Save & Publish.

---

### 🧠 Step 2: Set Up Data Layer Variables

Create these in **Variables > User-Defined > Data Layer Variable**:

| Variable Name      | Data Layer Variable Name        |
|--------------------|----------------------------------|
| `form_name`        | `form_details.form_name`        |
| `form_id`          | `form_details.form_id`          |
| `contact_name`     | `form_data.contact_name`        |
| `company_name`     | `form_data.company_name`        |
| `hashed_email`     | `form_data.hashed_email`        |
| `hashed_phone`     | `form_data.hashed_phone`        |
| `hashed_name`      | `form_data.hashed_name`         |
| `hashed_address`   | `form_data.hashed_address`      |
| `hashed_postcode`  | `form_data.hashed_zip`          |
| `hashed_country`   | `form_data.hashed_country`      |

> 💡 Use GTM **Preview Mode** to inspect actual field paths in your site’s dataLayer for additional fields.

---

### 🧾 Step 3: GA4 Event Tag Setup

1. **Tag Type:** GA4 Event
2. **Event Name:** `{{form_name}}`
3. **Event Parameters:**

| Parameter         | Value                      |
|-------------------|----------------------------|
| `form_id`         | `{{form_id}}`              |
| `contact_name`    | `{{contact_name}}`         |
| `hashed_email`    | `{{hashed_email}}`         |
| `hashed_phone`    | `{{hashed_phone}}`         |
| `hashed_name`     | `{{hashed_name}}`          |

4. **Trigger:** Fire on Custom Event = `form_submission_hashed`

---

### 🔁 Step 4: Google Ads — User-Provided Data (UPD)

#### A) Create User-Provided Data Variable (Optional, but recommended)
1. In GTM → Variables → New → Variable Configuration → **User-Provided Data**.
2. Click **"Add User-Provided Data"**
3. Map the following:

| Field           | Variable             |
|----------------|----------------------|
| Email           | `{{hashed_email}}`   |
| Phone Number    | `{{hashed_phone}}`   |
| Name            | `{{hashed_name}}`    |
| Address         | `{{hashed_address}}` |
| Zip             | `{{hashed_postcode}}`|
| Country         | `{{hashed_country}}` |

---

#### B) Create Google Ads Event Tag

1. **Tag Type:** Google Ads → User-Provided Data Event
2. Select your Conversion ID.
3. Link the **User-Provided Data Variable** you created above.
4. **Trigger:** Custom Event = `form_submission_hashed`

---

## 🧪 Testing

1. Open **GTM Preview Mode**.
2. Submit your form.
3. Confirm the `form_submission_hashed` event appears.
4. Expand the event and verify `form_data` and `form_details` contain expected values.

---

## 🔐 Fields That Will Be Hashed

The script automatically hashes fields if their name (or label) includes:

| Field (Detected by name match) | Hashed? | Notes                          |
|--------------------------------|---------|--------------------------------|
| `email`                        | ✅      | Lowercased and trimmed         |
| `phone`                        | ✅      | Digits only, stripped clean    |
| `name`                         | ✅      | Used when there's no F/L split |
| `first name` / `last name`     | ✅      | Lowercased and trimmed         |
| `address`                      | ✅      | Lowercased and trimmed         |
| `zip` / `postcode`             | ✅      | Lowercased and trimmed         |
| `country`                      | ✅      | Lowercased and trimmed         |

---

## 🔎 Requirements

- Form inputs must have `name` attributes.
- Must use **standard HTML form submissions** (not SPA/AJAX).
- Browser support for `crypto.subtle` (most modern browsers).

---

## ❗ Not Supported

- AJAX-only or JavaScript-rendered forms (e.g., React, Vue, Ninja Forms, Gravity Forms).
  - ✅ Use our alternate scripts for **Ninja Forms** or **Gravity Forms**.
- Consent checks are not built-in (can be added manually via CMP/GTM logic).

---

## 📦 Repository Files

- `form-tracking.js` – The main script
- `README.md` – This file

---

Need help with Ninja Forms or Gravity Forms?
👉 Contact: [info@nathanoconnor.co.uk](mailto:info@nathanoconnor.co.uk)
