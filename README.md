# 📊 HTML Form Tracking & Hashing Script (v2)

This guide explains how to install and use the updated **HTML Form Tracking Script** by **Nathan O'Connor**. The script pushes a `form_submission_hashed` event to the `dataLayer` when an HTML form is submitted, with specific personal data fields hashed for enhanced privacy compliance and compatibility with Google Ads Enhanced Conversions and GA4.

---

## 🔍 Features

- ✅ Detects and captures all standard HTML form submissions
- 🔒 Hashes sensitive data (e.g. name, email, phone, address) using SHA-256
- ✨ Automatically normalizes all field names to lowercase and underscores
- 🔢 Cleans phone numbers (digits only)
- 🔍 Detects field names like `name`, `full_name`, `postcode`, etc.
- 📊 Pushes a `form_submission_hashed` event with `form_details` and `form_data` objects

---

## 🚀 Installation

### Step 1: Add the Script to Google Tag Manager
1. Go to [Google Tag Manager](https://tagmanager.google.com/)
2. Navigate to **Tags** → Click **New**
3. Name it something like `HTML Form Tracking Script`
4. Tag Type: **Custom HTML**
5. Paste in the script (from `form-tracking.js`)
6. Tick ☑️ "Support document.write" if prompted
7. Trigger: Set to **All Pages** (or target pages with forms only)
8. Save and publish

### Step 2: Create GTM Variables
Navigate to **Variables** → **User-Defined Variables** and create:

| Variable Name         | Data Layer Variable Name       |
|----------------------|--------------------------------|
| `form_name`          | `form_details.form_name`       |
| `form_id`            | `form_details.form_id`         |
| `hashed_email`       | `form_data.hashed_email`       |
| `hashed_phone`       | `form_data.hashed_phone`       |
| `hashed_name`        | `form_data.hashed_name`        |
| `hashed_address`     | `form_data.hashed_address`     |
| `hashed_postcode`    | `form_data.hashed_postcode`    |
| `hashed_country`     | `form_data.hashed_country`     |

Use GTM Preview mode to inspect what variables are pushed to `dataLayer`.

### Step 3: Send Data to GA4 or Google Ads

#### GA4 Event Tag:
- Create a new **GA4 Event Tag**
- Event Name: `form_submission_hashed`
- Parameters:
  - `form_name`: `{{form_name}}`
  - `hashed_email`: `{{hashed_email}}`
  - etc.

#### Google Ads Enhanced Conversions:
- Go to your **Conversion Tag**
- Enable **Enhanced Conversions**
- Use the `dataLayer` option
- Map:
  - `Email`: `{{hashed_email}}`
  - `Phone`: `{{hashed_phone}}`

---

## 🔧 Requirements

- Forms must use standard HTML `<form>` elements
- All `<input>` fields must have a `name` attribute
- Browser must support `crypto.subtle` (modern browsers)

---

## ⚠️ Notes
- Does **not** support AJAX/SPA forms (e.g. Gravity, Ninja) — use separate scripts for those
- Data is only collected on actual submission
- All personal fields are hashed client-side
- Fields with names that contain keywords like `name`, `address`, `postcode`, etc., are automatically hashed

---

## ✍️ Author
**Nathan O'Connor**  
Digital Marketing Technologist & Privacy-First Tracking Specialist

Feel free to reach out for help adapting this for other platforms like Gravity Forms, Ninja Forms, or AJAX submissions.

