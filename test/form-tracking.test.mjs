/*
  End-to-end tests for html-forms v1.4.
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

const EVENT_NAME = 'html_form_submit';
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

const script = (country, consentMode) => {
  let out = SOURCE;
  if (country) {
    const cflag = `var DEFAULT_COUNTRY = '${country}';`;
    out = out.replace(/var DEFAULT_COUNTRY = '[A-Za-z]{2}';/, cflag);
    if (!out.includes(cflag)) throw new Error('could not set DEFAULT_COUNTRY');
  }
  if (consentMode) {
    const mflag = `var CONSENT_MODE = '${consentMode}';`;
    out = out.replace(/var CONSENT_MODE = '[a-z]+';/, mflag);
    if (!out.includes(mflag)) throw new Error('could not set CONSENT_MODE');
  }
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

  // The cancelling handler is delegated on `document` and registers AFTER
  // the tag, which is the ordering on a stock WordPress site: GTM in the
  // head, theme jQuery in the footer. The /cancelled page tests a handler
  // on the form itself, which always worked.
  '/delegated-cancel': page(`
    <form id="dc" action="/thanks" method="get">
      <input name="email" value="wp@example.com">
      <textarea name="message">secret enquiry text</textarea>
      <button type="submit">Send</button>
    </form>
    <script>
      window.__ajaxFired = 0;
      document.addEventListener('submit', function (e) {
        window.__ajaxFired++;
        e.preventDefault();
      });
    </script>`),

  /*
    The Meta Pixel's transport form, copied off a live site
    (doormaticgaragedoors.co.uk, 2026-08-06). fbevents.js appends this to the
    page and calls .submit() on it whenever it sends an event. Because the tag
    patches HTMLFormElement.prototype globally, every one of these was counted
    as a conversion — on that site once per step of a five-step quote form,
    while the real form went unreported. Google's gtag does the same thing.
  */
  '/pixel-transport': page(`
    <form id="real" action="/thanks" method="get">
      <input name="email" value="visitor@example.com">
      <button type="submit">Send</button>
    </form>
    <script>
      // Reproduced from the live form, including the detail that broke the
      // first attempt at the fix: fbevents appends dozens of inputs that
      // declare NO type attribute, so .type reports "text" for every one and
      // a type-based check lets the whole form through. The real one carried
      // 67. What is actually true of them is that none is ever painted.
      window.__firePixel = function () {
        var f = document.createElement('form');
        f.method = 'post';
        f.action = 'https://www.facebook.com/tr/';
        f.target = 'fb05424274817341537';
        f.setAttribute('accept-charset', 'utf-8');
        f.style.display = 'none';
        var i = document.createElement('iframe');
        i.src = 'about:blank';
        i.name = 'fb05424274817341537';
        f.appendChild(i);
        ['id','ev','dl','rl','if','ts','iw','sw','sh','v','r','ec','o','it','coo','es','tm','exp']
          .forEach(function (n) {
            var inp = document.createElement('input');   // deliberately no type
            inp.name = n;
            inp.value = '1';
            f.appendChild(inp);
          });
        document.body.appendChild(f);
        f.submit();
      };
    </script>`),

  // A real form the site hides the moment it is submitted — a modal closing,
  // a spinner swapping in. The verdict has to be taken in the capture phase or
  // this reads as an unrendered form and the lead is thrown away.
  '/hides-on-submit': page(`
    <form id="modal" class="hf-form" action="/thanks" method="get">
      <input name="email" value="hidden.form@example.com">
      <button type="submit">Send</button>
    </form>
    <script>
      document.addEventListener('submit', function (e) {
        e.preventDefault();
        e.target.style.display = 'none';
      }, false);
    </script>`),

  // A transport form carrying hidden fields rather than an iframe — the shape
  // Google's conversion tags use. Hidden fields are page-controlled, so they
  // are not evidence a person was involved either.
  '/hidden-only-transport': page(`
    <form id="ht" action="/thanks" method="get">
      <input type="hidden" name="email" value="pixel@example.com">
      <input type="hidden" name="token" value="abc">
    </form>`),

  /*
    An AJAX form shaped like the HTML Forms WordPress plugin: a document-level
    bubble listener that cancels and posts over XHR, registered after the tag,
    then resets the form. Reproduced from that plugin's public.js.
  */
  '/ajax-plugin': page(`
    <form id="ajax" class="hf-form" action="/thanks" method="get">
      <input name="your-email" value="Lead.Person@gmail.com">
      <input name="your-phone" value="07700 900123">
      <input name="your-name"  value="Lead Person">
      <textarea name="message">please quote me</textarea>
      <button type="submit">Send your request</button>
    </form>
    <script>
      window.__xhrFired = 0;
      document.addEventListener('submit', function (e) {
        if (e.target.className.indexOf('hf-form') < 0) return;
        e.preventDefault();
        window.__xhrFired++;
        setTimeout(function () { e.target.reset(); }, 20);
      }, false);
    </script>`),

  '/formaction': page(`
    <form id="fa" action="/thanks" method="get">
      <input name="email" value="fa@example.com">
      <button type="submit" name="op" value="draft" formaction="/other">Save draft</button>
    </form>`),

  '/other': page('<h1>other</h1>'),

  '/explicit-place': page(`
    <form id="ep" action="/thanks" method="get">
      <input name="email" value="ep@example.com">
      <input name="town"     data-upd="city"   value="Southampton">
      <input name="the_area" data-upd="region" value="Hampshire">
      <button type="submit">Send</button>
    </form>`),

  '/hidden': page(`
    <form id="hid" action="/thanks" method="get">
      <input type="hidden" name="email" value="salesrep@internal-crm.example">
      <input type="hidden" name="name"  value="Assigned Owner Bob">
      <input name="phone" value="07700 900123">
      <button type="submit">Send</button>
    </form>`),

  '/output-el': page(`
    <form id="oe" action="/thanks" method="get">
      <output name="email">rendered@example.com</output>
      <input name="phone" value="07700 900123">
      <button type="submit">Send</button>
    </form>`),

  '/free-text-region': page(`
    <form id="ftr" action="/thanks" method="get">
      <input name="email" value="ft@example.com">
      <input name="state" value="I am currently signed off sick with depression">
      <input name="city"  value="Southampton">
      <button type="submit">Send</button>
    </form>`),

  '/builders': page(`
    <form id="builders" action="/thanks" method="get">
      <input name="form_fields[email]"  value="elementor@example.com">
      <input name="form_fields[name]"   value="Elle Mentor">
      <input name="mobilephone"         value="07700 900123">
      <input name="address[zip]"        value="SO99 9XX">
      <input name="address[province]"   value="Hampshire">
      <input name="address[address1]"   value="123 New Rd">
      <button type="submit">Send</button>
    </form>`),

  '/form-name': page(`
    <form id="fn" action="/thanks" method="get">
      <input type="text" name="form_name" value="Contact Enquiry Form">
      <input name="email" value="fn@example.com">
      <button type="submit">Send</button>
    </form>`),

  '/clobber-global': page(`
    <a id="__formTracking">clobbered</a>
    <form id="cg" action="/thanks" method="get">
      <input name="email" value="cg@example.com">
      <button type="submit">Send</button>
    </form>`),

  '/no-fields': page(`
    <form id="nf" action="/thanks" method="get">
      <input name="subject" value="General enquiry">
      <textarea name="message">nothing matchable here</textarea>
      <button type="submit">Send</button>
    </form>`),

  // Submits into an iframe so the page survives, letting one test submit
  // twice with a consent withdrawal in between.
  '/consent': page(`
    <iframe name="sink" style="display:none"></iframe>
    <form id="cf" action="/thanks" method="get" target="sink">
      <input name="email" value="consent@example.com">
      <input name="phone" value="07700 900123">
      <button type="submit">Send</button>
    </form>`),

  '/email': page(`
    <form id="em-form" action="/thanks" method="get">
      <input id="em" name="email" value="">
      <button type="submit">Send</button>
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
async function run(path, installs = 1, act, opts = {}) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const records = [];
  await pg.exposeFunction('__record', (o) => { records.push(o); });
  // opts.silentGtm models a container that never invokes eventCallback, so
  // the only thing releasing the submission is the MAX_DELAY_MS timeout.
  await pg.addInitScript(
    opts.silentGtm ? DATALAYER_STUB.replace('if (cb) setTimeout(cb, 10);', '') : DATALAYER_STUB
  );
  // The script fails closed, so every run needs an explicit grant unless
  // the test is specifically probing what happens without one.
  if (opts.consent !== 'none') {
    await pg.addInitScript(`window.dataLayer.push(['consent','default',
      { ad_user_data: 'granted', ad_storage: 'granted' }]);`);
  }
  // injectAfterLoad models GTM running the tag on a consent update, after
  // the DOM already exists, rather than at document-start.
  if (!opts.injectAfterLoad) {
      for (let i = 0; i < installs; i++) await pg.addInitScript(script(opts.country, opts.consentMode));
  }
  await pg.goto(`${BASE}${path}`);
  if (opts.injectAfterLoad) {
    for (let i = 0; i < installs; i++) {
      await pg.addScriptTag({ content: script(opts.country, opts.consentMode) });
    }
  }
  await (act || (async (p) => { await p.click('button[type=submit]'); }))(pg);
  await pg.waitForTimeout(opts.silentGtm ? 1800 : 400);
  const url = pg.url();
  const submissions = records.filter((r) => r.event === EVENT_NAME);
  await ctx.close();
  return { records, submissions, url };
}

/* ── Static checks (no browser needed) ────────────────────────────────── */

console.log('\nGTM Custom HTML compatibility');
{
  // GTM substitutes {{ ... }} anywhere in a Custom HTML tag, including
  // inside JavaScript comments — it does not parse the JS. A stray
  // {{Page Path}} in a comment shipped in v1.2 and GTM rejected it as an
  // unsupported variable when the built-in was not enabled.
  const braces = SOURCE.match(/\{\{[^}]*\}\}/g) || [];
  check('no GTM variable syntax anywhere in the script',
    braces.length === 0, braces.join(', '));

  // Custom HTML tags are pasted whole, so the wrapper has to be there.
  const raw = readFileSync(join(HERE, '..', 'html-forms'), 'utf8');
  check('file is wrapped in <script> tags for pasting',
    /^\s*<script>/.test(raw) && /<\/script>\s*$/.test(raw));

  // A </script> inside the body would close the tag early.
  check('no stray closing script tag in the body',
    !SOURCE.includes('</script>'));
}

/* ── Tests ───────────────────────────────────────────────────────────── */

console.log('\nbase variant (no consent)');
{
  const { submissions, url } = await run('/contact', 1, null, { consent: 'none' });
  check('pushes exactly one form_submit', submissions.length === 1, `got ${submissions.length}`);
  check('carries form details', submissions[0]?.form_details?.form_name === 'Contact Us');
  check('carries no user_data', !submissions[0]?.user_data);
  check('no personal data anywhere in payload',
    !/gmail|900123|jane|smith/i.test(JSON.stringify(submissions)));
  check('form still submits', url.includes('/thanks'), url);
}

console.log('\nuser-data variant — normalisation');
{
  const { submissions, url } = await run('/contact', 1);
  const ud = submissions[0]?.user_data || {};
  const addr = ud.address || {};

  check('pushes exactly one form_submit', submissions.length === 1, `got ${submissions.length}`);
  check('email: lowercased, gmail dots stripped',
    ud.sha256_email_address === sha256('janedoe@gmail.com'), ud.sha256_email_address);
  check('phone: national 07700 900123 → E.164 +447700900123',
    ud.sha256_phone_number === sha256('+447700900123'), ud.sha256_phone_number);
  check('full name split → first', addr.sha256_first_name === sha256('jane'));
  check('full name split → last (last token)', addr.sha256_last_name === sha256('smith'));
  check('postal_code sent in the CLEAR, spaces stripped',
    addr.postal_code === 'so99 9xx', addr.postal_code);
  check('country name mapped to alpha-2, in the CLEAR',
    addr.country === 'GB', addr.country);
  check('postal_code is not hashed', !('sha256_postal_code' in addr));
  check('country is not hashed', !('sha256_country' in addr));
  check('company_name dropped entirely',
    !JSON.stringify(submissions).toLowerCase().includes('acme'));
  check('free-text message dropped entirely',
    !JSON.stringify(submissions).toLowerCase().includes('nhs'));
  check('form still submits', url.includes('/thanks'), url);
}

console.log('\nuser-data variant — explicit address fields');
{
  const { submissions } = await run('/split-name', 1);
  const ud = submissions[0]?.user_data || {};
  const addr = ud.address || {};
  check('first_name trimmed + lowercased', addr.sha256_first_name === sha256('john'));
  check('last_name hashed', addr.sha256_last_name === sha256('doe'));
  check('non-gmail dots preserved',
    ud.sha256_email_address === sha256('john.doe@example.com'));
  check('phone +44 (0)7700 900456 → +447700900456',
    ud.sha256_phone_number === sha256('+447700900456'), ud.sha256_phone_number);
  check('street hashed', addr.sha256_street === sha256('123 new rd'));
  check('city NOT matched by field name', !addr.city, addr.city);
  check('region NOT matched by field name (county)', !addr.region, addr.region);
  check('alpha-2 country passed through uppercased', addr.country === 'GB');
}

console.log('\nwaiting for tags before navigating');
{
  // Both paths must hold the submission until GTM reports its tags fired,
  // otherwise the conversion pixel races the unload. The consent-denied
  // event needs this as much as the enriched one.
  const base = await run('/contact', 1, null, { consent: 'none' });
  check('base event asks GTM to call back', base.submissions[0]?.eventTimeout === 1200,
    String(base.submissions[0]?.eventTimeout));

  const upd = await run('/contact', 1);
  check('enriched event asks GTM to call back', upd.submissions[0]?.eventTimeout === 1200,
    String(upd.submissions[0]?.eventTimeout));

  const noFields = await run('/no-fields', 1);
  check('no-matchable-fields fallback asks GTM to call back',
    noFields.submissions[0]?.eventTimeout === 1200, String(noFields.submissions[0]?.eventTimeout));
}
{
  // A container that never calls eventCallback must not strand the form.
  const { submissions, url } = await run('/contact', 1, null, { silentGtm: true });
  check('silent GTM: event still pushed', submissions.length === 1, `got ${submissions.length}`);
  check('silent GTM: form still submits on timeout', url.includes('/thanks'), url);
}
{
  const { url } = await run('/contact', 1, null, { silentGtm: true });
  check('silent GTM: user-data path still submits on timeout', url.includes('/thanks'), url);
}

console.log('\nnot overriding another script’s cancellation');
{
  // Both independent reviewers reproduced this: a delegated handler on
  // document, registered after the tag, cancels the submit and the script
  // used to natively re-submit anyway. The site's AJAX fires AND the page
  // navigates, so the lead posts twice and the form contents end up in a
  // URL the site deliberately prevented.
  const { submissions, url } = await run('/delegated-cancel', 1);
  check('delegated preventDefault is respected: no navigation',
    !url.includes('/thanks'), url);
  check('form contents never reach a URL',
    !url.includes('wp%40example.com') && !url.includes('secret'), url);
  // Changed in 1.3. Up to 1.2 this asserted NO conversion, which is how the
  // AJAX blind spot got enshrined: respecting the cancellation was conflated
  // with staying silent about it. Reporting and not-interfering are separate
  // things, and only the second one was ever the requirement.
  check('cancelled submission IS reported',
    submissions.length === 1, JSON.stringify(submissions));
}
{
  // Same check for the base tag, which the README calls personal-data-free.
  const { url } = await run('/delegated-cancel', 1, null, { consent: 'none' });
  check('base tag also respects it', !url.includes('/thanks'), url);
}

console.log('\nsubmitter button');
{
  const { url } = await run('/contact', 1);
  check('submitter name/value carried through the deferral',
    url.includes('action=send'), url);
}
{
  const { url } = await run('/formaction', 1);
  check('formaction override respected', url.includes('/other'), url);
  check('and the submitter value still carried', url.includes('op=draft'), url);
}
{
  const { submissions, url } = await run('/contact', 1, async (p) => {
    // Both clicks in one synchronous turn. Going through Playwright's
    // actionability checks lets the hold finish first, which hides the race.
    await p.evaluate(() => {
      const b = document.querySelector('button[type=submit]');
      b.click();
      b.click();
    });
  });
  check('double click fires one conversion, not two',
    submissions.length === 1, `got ${submissions.length}`);
  check('double click does not duplicate the submitter param',
    (url.match(/action=send/g) || []).length === 1, url);
}

console.log('\nconsent withdrawn mid-session');
{
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
    await p.evaluate(() => window.dataLayer.push(
      ['consent', 'update', { ad_user_data: 'denied', ad_storage: 'denied' }]));
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
  });
  check('two submissions recorded', submissions.length === 2, `got ${submissions.length}`);
  check('first submission (consent granted) carries user_data', !!submissions[0]?.user_data);
  check('second submission (consent withdrawn) carries NONE',
    !submissions[1]?.user_data, JSON.stringify(submissions[1]?.user_data));
}

console.log('\nconsent must fail closed, not open');
{
  // Every one of these leaked user_data before the fail-closed rewrite.
  const cases = [
    ['no consent signal at all',        () => {}],
    ['CMP pushes a plain object',       () => { window.dataLayer.push(
      { consent: 'update', ad_user_data: 'denied' }); }],
    ['dataLayer replaced wholesale',    () => {
      window.dataLayer.push(['consent', 'update', { ad_user_data: 'denied' }]);
      const recordingPush = window.dataLayer.push;
      window.dataLayer = [];
      // Carry the recording hook across, or a leak into the fresh array
      // goes unobserved and the probe passes without proving anything.
      window.dataLayer.push = recordingPush; }],
    ['dataLayer length reset',          () => {
      window.dataLayer.push(['consent', 'update', { ad_user_data: 'denied' }]);
      window.dataLayer.length = 0; }],
    ['late default after an update',    () => {
      window.dataLayer.push(['consent', 'update',  { ad_user_data: 'denied'  }]);
      window.dataLayer.push(['consent', 'default', { ad_user_data: 'granted' }]); }],
    ['consent fn returns undefined',    () => { window.formTrackingConsentFn = () => undefined; }],
    ['consent fn returns 0',            () => { window.formTrackingConsentFn = () => 0; }]
  ];
  for (const [label, setup] of cases) {
    const { submissions } = await run('/consent', 1, async (p) => {
      await p.evaluate(`(${setup.toString()})()`);
      await p.click('button[type=submit]');
      await p.waitForTimeout(250);
    }, { consent: 'none' });
    check(`${label} → no user_data`, !submissions[0]?.user_data,
      JSON.stringify(submissions[0]?.user_data));
  }
}
{
  // ...but a genuine grant must still work, or the whole feature is dark.
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => window.dataLayer.push(
      ['consent', 'update', { ad_user_data: 'granted', ad_storage: 'granted' }]));
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check('an explicit grant still collects', !!submissions[0]?.user_data);
}
{
  // Both reviewers found this independently: a region-scoped default for
  // somewhere else must not zero user_data for everyone.
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => {
      window.dataLayer.push(['consent', 'default', { ad_user_data: 'granted' }]);
      window.dataLayer.push(['consent', 'default', { ad_user_data: 'denied', region: ['ES'] }]);
    });
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check('a region-scoped default elsewhere does not deny here',
    !!submissions[0]?.user_data, JSON.stringify(submissions[0]));
}
{
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => { window.formTrackingConsentFn = () => true; });
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check('consent fn returning true collects', !!submissions[0]?.user_data);
}

console.log('\nfields the site controls, not the visitor');
{
  const { submissions } = await run('/hidden', 1);
  const blob = JSON.stringify(submissions);
  check('hidden field email not hashed as the visitor’s',
    !blob.includes(sha256('salesrep@internal-crm.example')), blob);
  check('hidden field name not hashed as the visitor’s',
    !blob.includes(sha256('assigned')) && !blob.includes(sha256('bob')));
  check('the real visible field is still collected',
    submissions[0]?.user_data?.sha256_phone_number === sha256('+447700900123'));
}
{
  const { submissions } = await run('/output-el', 1);
  check('<output> is not collected',
    !submissions[0]?.user_data?.sha256_email_address,
    JSON.stringify(submissions[0]?.user_data));
}
{
  const { submissions } = await run('/free-text-region', 1);
  const addr = submissions[0]?.user_data?.address || {};
  check('prose in a field named "state" is dropped, not sent in the clear',
    !addr.region, addr.region);
  check('a real city is not name-matched either', !addr.city, addr.city);
}
{
  const { submissions } = await run('/contact', 1, null,
    { injectAfterLoad: true });
  check('form_details carries no page_path',
    !('page_path' in (submissions[0]?.form_details || {})),
    JSON.stringify(submissions[0]?.form_details));
}
{
  const { submissions } = await run('/clobber-global', 1, null,
    { injectAfterLoad: true });
  check('id="__formTracking" cannot disable tracking',
    submissions[0]?.user_data?.sha256_email_address === sha256('cg@example.com'),
    JSON.stringify(submissions));
}

console.log('\nplace fields require an explicit opt-in');
{
  const { submissions } = await run('/explicit-place', 1);
  const addr = submissions[0]?.user_data?.address || {};
  check('data-upd="city" collects', addr.city === 'southampton', addr.city);
  check('data-upd="region" collects', addr.region === 'hampshire', addr.region);
}
{
  // form_name carries the form's title on several WP plugins. Splitting it
  // into first/last poisons the match data with something not a person.
  const { submissions } = await run('/form-name', 1);
  const addr = submissions[0]?.user_data?.address || {};
  check('form_name is never read as the visitor’s name',
    !addr.sha256_first_name && !addr.sha256_last_name, JSON.stringify(addr));
  check('the real name field still works', 
    submissions[0]?.user_data?.sha256_email_address === sha256('fn@example.com'));
}

console.log('\nreal-world form builders');
{
  const { submissions } = await run('/builders', 1);
  const ud = submissions[0]?.user_data || {};
  const addr = ud.address || {};
  check('Elementor form_fields[email]',
    ud.sha256_email_address === sha256('elementor@example.com'));
  check('Elementor form_fields[name] split',
    addr.sha256_first_name === sha256('elle') && addr.sha256_last_name === sha256('mentor'));
  check('HubSpot mobilephone',
    ud.sha256_phone_number === sha256('+447700900123'));
  check('Shopify address[zip]', addr.postal_code === 'so99 9xx', addr.postal_code);
  check('Shopify address[province] not matched by name', !addr.region, addr.region);
  check('Shopify address[address1]', addr.sha256_street === sha256('123 new rd'));
}
{
  // The prefix work must not break what already matched.
  const { submissions } = await run('/split-name', 1);
  check('address_1 still resolves to street, not stripped as a prefix',
    submissions[0]?.user_data?.address?.sha256_street === sha256('123 new rd'));
}

console.log('\ngmail normalisation');
for (const [input, expected] of [
  ['Jane.Doe+Shopping@googlemail.com', 'janedoe@googlemail.com'],
  ['jane.doe+forms@gmail.com',         'janedoe@gmail.com'],
  ['jane.doe@gmail.com',               'janedoe@gmail.com'],
  ['jane.doe+forms@example.com',       'jane.doe+forms@example.com']
]) {
  const { submissions } = await run('/email', 1, async (p) => {
    await p.fill('#em', input);
    await p.click('button[type=submit]');
  });
  check(`"${input}" → ${expected}`,
    submissions[0]?.user_data?.sha256_email_address === sha256(expected),
    submissions[0]?.user_data?.sha256_email_address);
}

console.log('\nphone → E.164 (DEFAULT_COUNTRY = IT)');
for (const [input, expected, label] of [
  ['06 1234 5678',     '+390612345678', 'Rome landline keeps its trunk zero'],
  ['+39 06 1234 5678', '+390612345678', 'international form unchanged'],
  ['320 1234567',      '+393201234567', 'mobile has no trunk zero to keep']
]) {
  const { submissions } = await run('/phone', 1, async (p) => {
    await p.fill('#tel', input);
    await p.click('button[type=submit]');
  }, { country: 'IT' });
  check(`${label}: "${input}" → ${expected}`,
    submissions[0]?.user_data?.sha256_phone_number === sha256(expected),
    submissions[0]?.user_data?.sha256_phone_number);
}

console.log('\nphone → E.164 (DEFAULT_COUNTRY = GB)');
for (const [input, expected, label] of PHONE_CASES) {
  const { submissions } = await run('/phone', 1, async (p) => {
    await p.fill('#tel', input);
    await p.click('button[type=submit]');
  });
  const got = submissions[0]?.user_data?.sha256_phone_number;
  if (expected === null) {
    check(`${label}: "${input}" dropped`, !got, got);
  } else {
    check(`${label}: "${input}" → ${expected}`, got === sha256(expected), got);
  }
}

console.log('\nthe tag firing more than once');
{
  // GTM can run a Custom HTML tag twice (two triggers, an SPA, a stray
  // duplicate). That must not double-count a conversion.
  const { submissions } = await run('/contact', 2);
  check('installed twice, exactly ONE form_submit', submissions.length === 1,
    `got ${submissions.length}`);
  check('and it still carries user_data', !!submissions[0]?.user_data);
}
{
  const { submissions } = await run('/contact', 3);
  check('installed three times, still ONE', submissions.length === 1,
    `got ${submissions.length}`);
}

console.log('\npasswords and payment data');
{
  const { submissions, url } = await run('/login', 1);
  const blob = JSON.stringify(submissions);
  check('password value never reaches dataLayer', !blob.includes('hunter2'), blob);
  check('login form yields no user_data', !submissions[0]?.user_data);
  check('base event still fires', submissions.length === 1 && submissions[0].event === EVENT_NAME);
  check('login form still submits', url.includes('/thanks'), url);
}

console.log('\nDOM clobbering');
{
  const { submissions } = await run('/clobber', 1);
  check('form_id read from attribute, not clobbered input',
    submissions[0]?.form_details?.form_id === 'real-id', submissions[0]?.form_details?.form_id);
  check('fields still read when form.elements is clobbered',
    submissions[0]?.user_data?.sha256_email_address === sha256('clobber@example.com'));
}

console.log('\ndata-upd mapping and opt-outs');
{
  const { submissions } = await run('/mapped', 1);
  check('data-upd maps an unmatchable field name',
    submissions[0]?.user_data?.sha256_email_address === sha256('mapped@example.com'));
  check('data-upd="ignore" excludes the field',
    !JSON.stringify(submissions).includes('secret'));
  check('unrecognised free text dropped',
    !JSON.stringify(submissions).includes('free text'));
}
{
  const { submissions, url } = await run('/no-track', 1);
  check('data-no-track form pushes nothing', submissions.length === 0, `got ${submissions.length}`);
  check('data-no-track form still submits', url.includes('/thanks'), url);
}

console.log('\ncancelled submissions');
{
  const { submissions, url } = await run('/cancelled', 1);
  check('preventDefault by a handler on the form is still reported',
    submissions.length === 1, JSON.stringify(submissions));
  check('page did not navigate', !url.includes('/thanks'), url);
}

console.log('\nforms submitted by other tags, not by a visitor');
{
  // The bug this release exists for. Nothing about the pixel's form involves
  // a person, and it must not produce a conversion.
  const { submissions } = await run('/pixel-transport', 1, async (p) => {
    await p.evaluate(() => window.__firePixel());
    await p.evaluate(() => window.__firePixel());
    await p.waitForTimeout(200);
  });
  check('Meta Pixel transport form is not a conversion',
    submissions.length === 0, JSON.stringify(submissions));
}
{
  // ...and the real form on the same page still is, so the guard is not
  // simply switching everything off.
  const { submissions, url } = await run('/pixel-transport', 1, async (p) => {
    await p.evaluate(() => window.__firePixel());
    await p.click('button[type=submit]');
  });
  check('the real form on that page still reports',
    submissions.length === 1, JSON.stringify(submissions));
  check('and reports the visitor, not the pixel',
    submissions[0]?.user_data?.sha256_email_address === sha256('visitor@example.com'),
    JSON.stringify(submissions));
  check('the real form still submits', url.includes('/thanks'), url);
}
{
  const { submissions } = await run('/hidden-only-transport', 1, async (p) => {
    await p.evaluate(() => document.getElementById('ht').submit());
    await p.waitForTimeout(200);
  });
  check('a hidden-fields-only transport form is not a conversion',
    submissions.length === 0, JSON.stringify(submissions));
}
{
  // The other direction: the guard must not throw away a real lead just
  // because the site hides the form while submitting it.
  const { submissions } = await run('/hides-on-submit', 1, async (p) => {
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
  });
  check('a form the site hides on submit is still a conversion',
    submissions.length === 1, JSON.stringify(submissions));
  check('and it still carries the visitor’s data',
    submissions[0]?.user_data?.sha256_email_address === sha256('hidden.form@example.com'),
    JSON.stringify(submissions));
}

console.log('\nAJAX forms (the WordPress plugin shape)');
{
  const { submissions, url } = await run('/ajax-plugin', 1, async (p) => {
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
  });
  const ud = submissions[0]?.user_data || {};
  check('an AJAX submission is reported at all',
    submissions.length === 1, JSON.stringify(submissions));
  check('reported exactly once, not once per handler',
    submissions.filter((s) => s.event === EVENT_NAME).length === 1);
  check('values are read before the plugin resets the form',
    ud.sha256_email_address === sha256('leadperson@gmail.com'),
    JSON.stringify(ud));
  check('phone still normalised on the AJAX path',
    ud.sha256_phone_number === sha256('+447700900123'), JSON.stringify(ud));
  check('free-text message still dropped',
    !JSON.stringify(submissions).includes('quote me'), JSON.stringify(submissions));
  check('the page does not navigate — the site keeps control',
    !url.includes('/thanks'), url);
}
{
  // The site's own XHR must fire exactly once. Firing it twice was the 1.1
  // incident that moved this listener to window in the first place.
  const { records } = await run('/ajax-plugin', 1, async (p) => {
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
    const fired = await p.evaluate(() => window.__xhrFired);
    await p.evaluate((n) => window.__record({ event: 'xhr-count', n }), fired);
  });
  const counted = records.find((r) => r.event === 'xhr-count');
  check('the site’s own XHR fired exactly once', counted?.n === 1, JSON.stringify(counted));
}
{
  // An impatient second click must not buy a second conversion.
  const { submissions } = await run('/ajax-plugin', 1, async (p) => {
    await p.click('button[type=submit]');
    await p.click('button[type=submit]');
    await p.waitForTimeout(300);
  });
  check('double-click on an AJAX form is still one conversion',
    submissions.length === 1, `got ${submissions.length}`);
}

console.log('\nprogrammatic form.submit()');
{
  const { submissions, url } = await run('/programmatic', 1, async (p) => {
    await p.evaluate(() => document.getElementById('prog').submit());
    await p.waitForURL('**/thanks', { timeout: 3000 }).catch(() => {});
  });
  check('hashes on programmatic submit',
    submissions[0]?.user_data?.sha256_email_address === sha256('prog@example.com'),
    JSON.stringify(submissions));
  check('programmatic submit still navigates', url.includes('/thanks'), url);
}

/*
  Expected statuses are written out as literals on purpose. Deriving them
  from the script's own constants would make these assertions agree with
  whatever the code happens to say, including a typo, which is how a suite
  ends up green while the field is broken.
*/
console.log('\nuser_data_status says why');
{
  const { submissions } = await run('/consent', 1);
  check("a grant reports 'collected'",
    submissions[0]?.user_data_status === 'collected', submissions[0]?.user_data_status);
  check('and carries user_data', !!submissions[0]?.user_data);
  check('and adds no cmp_detected', !('cmp_detected' in (submissions[0] || {})),
    submissions[0]?.cmp_detected);
}
{
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => window.dataLayer.push(
      ['consent', 'update', { ad_user_data: 'denied' }]));
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check("a denial reports 'consent_denied'",
    submissions[0]?.user_data_status === 'consent_denied', submissions[0]?.user_data_status);
  check('and carries no user_data', !submissions[0]?.user_data);
}
{
  const { submissions } = await run('/consent', 1, null, { consent: 'none' });
  check("silence under CONSENT_MODE 'cmp' reports 'no_consent_signal'",
    submissions[0]?.user_data_status === 'no_consent_signal', submissions[0]?.user_data_status);
  check('and carries no user_data', !submissions[0]?.user_data);
}
{
  const { submissions } = await run('/consent', 1, null,
    { consent: 'none', consentMode: 'none' });
  check("silence under CONSENT_MODE 'none' reports 'collected_undeclared'",
    submissions[0]?.user_data_status === 'collected_undeclared',
    submissions[0]?.user_data_status);
  check('and DOES carry user_data — this is the no-CMP case working',
    !!submissions[0]?.user_data, JSON.stringify(submissions[0]));
}
{
  // The declaration governs the silence only. A CMP that speaks still wins.
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => window.dataLayer.push(
      ['consent', 'update', { ad_user_data: 'denied' }]));
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none', consentMode: 'none' });
  check("a denial still wins under CONSENT_MODE 'none'",
    submissions[0]?.user_data_status === 'consent_denied', submissions[0]?.user_data_status);
  check('and no user_data is collected', !submissions[0]?.user_data,
    JSON.stringify(submissions[0]?.user_data));
}
{
  const { submissions } = await run('/no-fields', 1);
  check("a form with nothing matchable reports 'no_fields'",
    submissions[0]?.user_data_status === 'no_fields', submissions[0]?.user_data_status);
}
{
  // The invariant the whole design rests on: the conversion is never what
  // gets gated. Anything that suppresses the event is a bug, not a stricter
  // reading of consent.
  const cases = [
    ['granted',        { }],
    ['denied',         { consent: 'none' }],
    ['no signal, cmp', { consent: 'none' }],
    ['no signal, none',{ consent: 'none', consentMode: 'none' }]
  ];
  for (const [label, opts] of cases) {
    const { submissions } = await run('/consent', 1, null, opts);
    check(`event still fires: ${label}`, submissions.length === 1,
      `got ${submissions.length}`);
  }
}

console.log('\nCMP detection contradicts the declaration, never decides it');
{
  // The live failure this was built for: a CMP present, asking visitors,
  // emitting no Consent Mode signal at all. Naming it is the difference
  // between "something is wrong" and "go and wire this up".
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => {
      const s = document.createElement('script');
      s.id = 'cookieBanner-143376892';
      document.head.appendChild(s);
    });
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check('a silent CMP is still no_consent_signal',
    submissions[0]?.user_data_status === 'no_consent_signal', submissions[0]?.user_data_status);
  check('and cmp_detected names it', submissions[0]?.cmp_detected === 'HubSpot',
    submissions[0]?.cmp_detected);
  check('and the conversion event still fires', submissions.length === 1);
}
{
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => { window.OneTrust = {}; });
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none', consentMode: 'none' });
  check("declaring 'none' with a CMP present is flagged",
    submissions[0]?.cmp_detected === 'OneTrust', submissions[0]?.cmp_detected);
  check('but the declaration still governs — it collects',
    !!submissions[0]?.user_data, JSON.stringify(submissions[0]));
}
{
  const { submissions } = await run('/consent', 1, null, { consent: 'none' });
  check('no CMP on the page adds no cmp_detected key',
    !('cmp_detected' in (submissions[0] || {})), submissions[0]?.cmp_detected);
}
{
  // A CMP that throws when probed must not take the submission down with it.
  const { submissions } = await run('/consent', 1, async (p) => {
    await p.evaluate(() => {
      Object.defineProperty(window, 'Osano', {
        get() { throw new Error('probe exploded'); }
      });
    });
    await p.click('button[type=submit]');
    await p.waitForTimeout(250);
  }, { consent: 'none' });
  check('a CMP that throws when probed does not break the event',
    submissions.length === 1 && submissions[0]?.user_data_status === 'no_consent_signal',
    JSON.stringify(submissions[0]));
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
