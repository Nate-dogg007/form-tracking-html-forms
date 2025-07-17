🧩 Form Tracking & Hashing Script (by Nathan O'Connor)
This script tracks HTML form submissions, hashes sensitive fields (e.g., email and phone), and pushes the data into the dataLayer for use with Google Tag Manager, Google Ads Enhanced Conversions, and GA4.

📌 Features
🔒 Hashes email and phone fields using SHA-256 (privacy compliant).

🔎 Captures all input values from any HTML form.

🧼 Normalizes keys to lowercase with underscores (email_address, hashed_phone).

🧠 Supports forms that submit normally (non-AJAX).

📊 Pushes a form_submission_hashed event into the dataLayer.

📂 Files
form-tracking.js — The script to include in your site via GTM (or host on GitHub Pages/Cloudflare).

🚀 Installation Instructions
✅ Step 1: Add the Script to GTM
Open Google Tag Manager.

Go to Tags → Click New.

Name it something like Form Tracking Script.

Choose Tag Type: Custom HTML.

Paste the contents of form-tracking.js inside the HTML box.

Tick ✅ “Support document.write” if prompted.

Set the Trigger to All Pages (or limit to form-specific pages).

Save and Publish your container.

🛠 Step 2: Create Variables in GTM
In Variables → User-Defined Variables, create Data Layer Variables:

Variable Name	Data Layer Variable Name
form_name	form_details.form_name
form_id	form_details.form_id
contact_name (example)	form_data.contact_name
company_name (example)	form_data.company_name
hashed_email	form_data.hashed_email
hashed_phone	form_data.hashed_phone

🧠 Tip: Use GTM Preview Mode to inspect your form submission event and copy variable paths as needed.

📤 Step 3: Send to GA4 or Google Ads
GA4 Event Tag
Create a new GA4 Event Tag.

Use Event Name: form_submission_hashed

Add parameters such as:

form_name: {{form_name}}

form_id: {{form_id}}

contact_name: {{contact_name}}

Google Ads Enhanced Conversions
In your Google Ads Conversion Tag, enable Enhanced Conversions.

Toggle to use dataLayer.

Map fields like:

Email → {{form_data.hashed_email}}

Phone → {{form_data.hashed_phone}}

🧪 Testing
Use GTM Preview Mode.

Submit your form.

Ensure form_submission_hashed appears in the debug panel.

Check values under form_details and form_data.

📋 Requirements
Forms must use standard HTML <form> submission (not AJAX or JS-only).

Browser must support crypto.subtle API (modern browsers only).

Form inputs should have name attributes.

⚠️ Notes
This script does not track SPA frameworks (React/Vue/etc.) or Ninja Forms (AJAX) out-of-the-box.

For AJAX forms, a separate hook like nfFormSubmitResponse is needed (contact me for that version).

The script does not collect or send data without explicit form submission.

🧑‍💻 Author
Nathan O’Connor
For custom implementations or help adapting this script for Ninja Forms, AJAX, or React-based forms, feel free to get in touch.
