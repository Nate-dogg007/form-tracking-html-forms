/*
  End-to-end tests for html-forms v1.2.
  Runs the real script in real Chromium against real forms.

    npm install playwright   (or use a global install via NODE_PATH)
    node test/form-tracking.test.mjs

  Served over http://localhost so crypto.subtle is available (localhost
  counts as a secure context).
*/

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'html-forms'), 'utf8')
  .replace(/^\s*<script>/, '')
  .replace(/<\/script>\s*$/, '');

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const variant = (collect) => {
  const flag = `var COLLECT_USER_DATA = ${collect};`;
  const out = SOURCE.replace(/var COLLECT_USER_DATA = (?:true|false);/, flag);
  if (!out.includes(flag)) throw new Error('could not set COLLECT_USER_DATA');
  return out;
};

/* ── Test pages ──────────────────────────────────────────────────────── */

const page = (body) => `<!doctype html><meta charset="utf-8"><title>t</title>${body}`;

const PAGES = {
  '/contact': page(`
    <form id="contact" name="Contact Us" action="/thanks" method="get">
      <input name="your-name"    value="Jane Ann Smith">
      <input name="your-email"   value="Jane.Doe@Gmail.com">
      <input name="your-phone"   value="07700 900123">
      <input name="company_name" value="Acme Widgets Ltd">
      <input name="postcode"     value="SO99 9XX">
      <input name="country"      value="United Kingdom">
      <textarea name="your-message">Call me on 07700 900123, my NHS number is 123</textarea>
      <button type="submit" name="action" value="send">Send</button>
    </form>`),

  '/split-name': page(`
    <form id="split" action="/thanks" method="get">
      <input name="first_name" value="  JOHN  ">
      <input name="last_name"  value="Doe">
      <input name="email"      value="john.doe@example.com">
      <input name="tel"        value="+44 (0)7700 900456">
      <input name="address_1"  value="123 New Rd">
      <input name="city"       value="Southampton">
      <input name="county"     value="Hampshire">
      <input name="zip"        value="so99 9xx">
      <input name="country"    value="gb">
      <button type="submit">Send</button>
    </form>`),

  '/login': page(`
    <form id="login" action="/thanks" method="get">
      <input name="email"         value="victim@example.com">
      <input name="user_password" type="password" value="hunter2">
      <button type="submit">Log in</button>
    </form>`),

  '/clobber': page(`
    <form id="real-id" action="/thanks" method="get">
      <input name="id"       value="clobbered">
      <input name="elements" value="clobbered">
      <input name="email"    value="clobber@example.com">
      <button type="submit">Send</button>
    </form>`),

  '/mapped': page(`
    <form id="mapped" action="/thanks" method="get">
      <input name="wpforms[fields][1]" data-upd="email" value="mapped@example.com">
      <input name="wpforms[fields][2]" data-upd="ignore" value="secret">
      <input name="notes" value="free text">
      <button type="submit">Send</button>
    </form>`),

  '/no-track': page(`
    <form id="nt" action="/thanks" method="get" data-no-track>
      <input name="email" value="private@example.com">
      <button type="submit">Send</button>
    </form>`),

  '/cancelled': page(`
    <form id="cancelled" action="/thanks" method="get">
      <input name="email" value="never@example.com">
      <button type="submit">Send</button>
    </form>
    <script>
      document.getElementById('cancelled')
        .addEventListener('submit', function (e) { e.preventDefault(); });
    </script>`),

  '/programmatic': page(`
    <form id="prog" action="/thanks" method="get">
      <input name="email" value="prog@example.com">
    </form>`),

  '/phone': page(`
    <form id="p" action="/thanks" method="get">
      <input id="tel" name="phone" value="">
      <button type="submit">Send</button>
    </form>`),

  '/thanks': page('<h1>thanks</h1>')
};

// DEFAULT_COUNTRY in the script under test is GB.
const PHONE_CASES = [
  ['07700 900123',        '+447700900123', 'national with trunk zero'],
  ['+44 7700 900123',     '+447700900123', 'international'],
  ['+44 (0)7700 900123',  '+447700900123', 'international with (0) notation'],
  ['00447700900123',      '+447700900123', '00 international prefix'],
  ['447700900123',        '+447700900123', 'country code, no plus'],
  ['7700900123',          '+447700900123', 'bare national, no trunk zero'],
  ['(020) 7946 0958',     '+442079460958', 'parenthesised area code'],
  ['020 7946 0958',       '+442079460958', 'landline with trunk zero'],
  ['07700-900123',        '+447700900123', 'hyphenated'],
  ['123',                 null,            'too short — dropped'],
  ['not a phone',         null,            'non-numeric — dropped']
];

/* ── Harness ─────────────────────────────────────────────────────────── */

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const body = PAGES[path];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body || 'not found');
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();

// Stubs dataLayer the way GTM behaves: records the push, then invokes
// eventCallback asynchronously so the script's release path is exercised.
const DATALAYER_STUB = `
  window.dataLayer = [];
  window.dataLayer.push = function (obj) {
    var cb = obj.eventCallback;
    var copy = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k) && typeof obj[k] !== 'function') copy[k] = obj[k];
    }
    Array.prototype.push.call(window.dataLayer, copy);
    window.__record(copy);
    if (cb) setTimeout(cb, 10);
    return window.dataLayer.length;
  };`;

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/*
  Loads a page with the given script variants installed, runs `act`,
  and returns every dataLayer push that happened.
*/
async function run(path, variants, act) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const records = [];
  await pg.exposeFunction('__record', (o) => { records.push(o); });
  await pg.addInitScript(DATALAYER_STUB);
  for (const v of variants) await pg.addInitScript(variant(v));
  await pg.goto(`${BASE}${path}`);
  await (act || (async (p) => { await p.click('button[type=submit]'); }))(pg);
  await pg.waitForTimeout(400);
  const url = pg.url();
  await ctx.close();
  return { records, url };
}

/* ── Tests ───────────────────────────────────────────────────────────── */

console.log('\nbase variant (no consent)');
{
  const { records, url } = await run('/contact', [false]);
  check('pushes exactly one form_submit', records.length === 1, `got ${records.length}`);
  check('carries form details', records[0]?.form_details?.form_name === 'Contact Us');
  check('carries no user_data', !records[0]?.user_data);
  check('no personal data anywhere in payload',
    !/gmail|900123|jane|smith/i.test(JSON.stringify(records)));
  check('form still submits', url.includes('/thanks'), url);
}

console.log('\nuser-data variant — normalisation');
{
  const { records, url } = await run('/contact', [true]);
  const ud = records[0]?.user_data || {};
  const addr = ud.address || {};

  check('pushes exactly one form_submit', records.length === 1, `got ${records.length}`);
  check('email: lowercased, gmail dots stripped',
    ud.sha256_email_address === sha256('janedoe@gmail.com'), ud.sha256_email_address);
  check('phone: national 07700 900123 → E.164 +447700900123',
    ud.sha256_phone_number === sha256('+447700900123'), ud.sha256_phone_number);
  check('full name split → first', addr.sha256_first_name === sha256('jane'));
  check('full name split → last (last token)', addr.sha256_last_name === sha256('smith'));
  check('postal_code sent in the CLEAR, spaces stripped',
    addr.postal_code === 'so999xx', addr.postal_code);
  check('country name mapped to alpha-2, in the CLEAR',
    addr.country === 'GB', addr.country);
  check('postal_code is not hashed', !('sha256_postal_code' in addr));
  check('country is not hashed', !('sha256_country' in addr));
  check('company_name dropped entirely',
    !JSON.stringify(records).toLowerCase().includes('acme'));
  check('free-text message dropped entirely',
    !JSON.stringify(records).toLowerCase().includes('nhs'));
  check('form still submits', url.includes('/thanks'), url);
}

console.log('\nuser-data variant — explicit address fields');
{
  const { records } = await run('/split-name', [true]);
  const ud = records[0]?.user_data || {};
  const addr = ud.address || {};
  check('first_name trimmed + lowercased', addr.sha256_first_name === sha256('john'));
  check('last_name hashed', addr.sha256_last_name === sha256('doe'));
  check('non-gmail dots preserved',
    ud.sha256_email_address === sha256('john.doe@example.com'));
  check('phone +44 (0)7700 900456 → +447700900456',
    ud.sha256_phone_number === sha256('+447700900456'), ud.sha256_phone_number);
  check('street hashed', addr.sha256_street === sha256('123 new rd'));
  check('city in the clear', addr.city === 'southampton', addr.city);
  check('region (county) in the clear', addr.region === 'hampshire', addr.region);
  check('alpha-2 country passed through uppercased', addr.country === 'GB');
}

console.log('\nphone → E.164 (DEFAULT_COUNTRY = GB)');
for (const [input, expected, label] of PHONE_CASES) {
  const { records } = await run('/phone', [true], async (p) => {
    await p.fill('#tel', input);
    await p.click('button[type=submit]');
  });
  const got = records[0]?.user_data?.sha256_phone_number;
  if (expected === null) {
    check(`${label}: "${input}" dropped`, !got, got);
  } else {
    check(`${label}: "${input}" → ${expected}`, got === sha256(expected), got);
  }
}

console.log('\nboth variants installed (consent granted)');
{
  const { records } = await run('/contact', [false, true]);
  check('exactly ONE form_submit, not two', records.length === 1, `got ${records.length}`);
  check('the surviving event is the enriched one', !!records[0]?.user_data);
}
{
  const { records } = await run('/contact', [true, false]);
  check('order-independent (user-data tag first)', records.length === 1, `got ${records.length}`);
  check('still enriched', !!records[0]?.user_data);
}

console.log('\nre-firing the same tag');
{
  const { records } = await run('/contact', [true, true]);
  check('double install does not double-count', records.length === 1, `got ${records.length}`);
}

console.log('\npasswords and payment data');
{
  const { records, url } = await run('/login', [true]);
  const blob = JSON.stringify(records);
  check('password value never reaches dataLayer', !blob.includes('hunter2'), blob);
  check('login form yields no user_data', !records[0]?.user_data);
  check('base event still fires', records.length === 1 && records[0].event === 'form_submit');
  check('login form still submits', url.includes('/thanks'), url);
}

console.log('\nDOM clobbering');
{
  const { records } = await run('/clobber', [true]);
  check('form_id read from attribute, not clobbered input',
    records[0]?.form_details?.form_id === 'real-id', records[0]?.form_details?.form_id);
  check('fields still read when form.elements is clobbered',
    records[0]?.user_data?.sha256_email_address === sha256('clobber@example.com'));
}

console.log('\ndata-upd mapping and opt-outs');
{
  const { records } = await run('/mapped', [true]);
  check('data-upd maps an unmatchable field name',
    records[0]?.user_data?.sha256_email_address === sha256('mapped@example.com'));
  check('data-upd="ignore" excludes the field',
    !JSON.stringify(records).includes('secret'));
  check('unrecognised free text dropped',
    !JSON.stringify(records).includes('free text'));
}
{
  const { records, url } = await run('/no-track', [true]);
  check('data-no-track form pushes nothing', records.length === 0, `got ${records.length}`);
  check('data-no-track form still submits', url.includes('/thanks'), url);
}

console.log('\ncancelled submissions');
{
  const { records, url } = await run('/cancelled', [true]);
  check('preventDefault by another handler = no conversion',
    records.length === 0, JSON.stringify(records));
  check('page did not navigate', !url.includes('/thanks'), url);
}

console.log('\nprogrammatic form.submit()');
{
  const { records, url } = await run('/programmatic', [true], async (p) => {
    await p.evaluate(() => document.getElementById('prog').submit());
    await p.waitForURL('**/thanks', { timeout: 3000 }).catch(() => {});
  });
  check('hashes on programmatic submit',
    records[0]?.user_data?.sha256_email_address === sha256('prog@example.com'),
    JSON.stringify(records));
  check('programmatic submit still navigates', url.includes('/thanks'), url);
}

/* ── Result ──────────────────────────────────────────────────────────── */

await browser.close();
server.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nfailures:');
  failures.forEach((f) => console.log(`  • ${f}`));
  process.exit(1);
}
