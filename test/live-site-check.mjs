/*
  Runs the real tag against a REAL SITE, in a real browser, and checks the two
  things the fixtures in form-tracking.test.mjs can only approximate:

    1. tags on the page that submit hidden forms do not produce a conversion
    2. a genuine submission of the site's own form produces exactly one

  Why this exists as well as the fixture suite: the first version of the 1.3
  guard passed every fixture and still failed on the live page, because the
  real Meta Pixel form carries 67 inputs with no type attribute and the
  invented one carried none at all. A fixture written from the implementation
  only ever tests the implementation.

    node test/live-site-check.mjs [url]

  Defaults to the site the bug was found on. Notes before running it:

    - HEADED on purpose. That site's bot protection serves headless Chromium a
      76-byte body, so a headless run silently measures nothing.
    - The lead POST to admin-ajax.php is ABORTED, so no enquiry ever reaches
      the site owner. Keep that route in place if you point this somewhere new,
      and check the endpoint name matches — a different form plugin posts
      elsewhere, and then you are sending real enquiries.
    - The tag is installed at document-start, so a copy already deployed in the
      site's GTM hits the install guard and no-ops. You are testing THIS
      working copy, not what is deployed.
*/
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SRC = readFileSync(new URL('../html-forms', import.meta.url), 'utf8')
  .replace(/^\s*<script>/, '')
  .replace(/<\/script>\s*$/, '');
const SITE = process.argv[2] || 'https://www.doormaticgaragedoors.co.uk/';

let pass = 0; const fails = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// Headed on purpose: the site's bot protection serves headless Chromium an
// empty body (76 bytes), the same block that returns 426 to curl. A headless
// run here measures nothing at all.
/*
  Ground truth is the dataLayer array itself, not a wrapper around .push.

  GTM and gtag each replace dataLayer.push with their own, chained. A recorder
  spliced into that chain sees one logical push three times, which read as a
  triple conversion until it was checked against the array. Count the entries.
*/
const dlCount = (pg) =>
  pg.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === 'html_form_submit').length);

const browser = await chromium.launch({ headless: false });

async function session(label) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const events = [];
  await pg.exposeFunction('__rec', (o) => events.push(o));

  // Never let a test enquiry reach the client.
  let blocked = 0;
  await pg.route('**/admin-ajax.php*', (route) => { blocked++; route.abort(); });

  await pg.addInitScript(`
    window.dataLayer = window.dataLayer || [];
    (function () {
      var wrap = function () {
        var dl = window.dataLayer;
        if (!dl || typeof dl.push !== 'function' || dl.push.__w) return;
        var orig = dl.push;
        var p = function () {
          var a = arguments[0];
          try { if (a && a.event === 'html_form_submit') window.__rec(JSON.parse(JSON.stringify(a))); } catch (e) {}
          return orig.apply(dl, arguments);
        };
        p.__w = true; dl.push = p;
      };
      wrap(); setInterval(wrap, 80);
      // Grant consent directly, so this measures firing behaviour and not the
      // site's broken banner (a separate finding, not what v1.3 changes).
      window.formTrackingConsentFn = function () { return true; };
    })();
  `);
  await pg.addInitScript(SRC);   // v1.3 wins; the site's v1.2 hits the install guard
  await pg.goto(SITE, { waitUntil: 'load' });
  /*
    The quote form is lazy-rendered on scroll, and it sits well down the page.
    A headless run never scrolls, so the first attempt at this reported
    "no conversion" against a page that had no form on it — a pass that
    measured nothing. Scroll it into view, then wait for it for real.
  */
  await pg.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  let formPresent = true;
  try { await pg.waitForSelector('.hf-form', { timeout: 30000 }); }
  catch { formPresent = false; }
  await pg.waitForTimeout(800);
  console.log(`\n${label}`);
  return { pg, ctx, events, formPresent, blockedCount: () => blocked };
}

/* 1. The reported bug: stepping through the quote form must not fire. */
{
  const { pg, ctx, events, formPresent } = await session('walking the multi-step quote form (the reported bug)');
  const installed = await pg.evaluate(() => !!(window.__formTracking && window.__formTracking.installed));
  check('tag is installed on the live page', installed);
  // Guarded, so "no conversion" can never pass against an empty page.
  check('the quote form actually rendered', formPresent);

  const steps = await pg.evaluate(async () => {
    const f = document.querySelector('.hf-form');
    if (!f) return 'no form';
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const active = f.querySelector('.cf-step.active');
      if (!active) break;
      const cb = active.querySelector('input[type=checkbox], input[type=radio]');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      const txt = active.querySelector('input[type=text], input[type=email], input[type=tel], textarea');
      if (txt && !txt.value) { txt.value = 'test'; txt.dispatchEvent(new Event('input', { bubbles: true })); }
      const next = active.querySelector('.cf-step__next');
      if (!next) break;
      next.click();
      await new Promise((r) => setTimeout(r, 700));
      const nowActive = f.querySelector('.cf-step.active h3');
      seen.push(nowActive ? nowActive.textContent.trim().slice(0, 40) : '?');
    }
    return seen;
  });
  await pg.waitForTimeout(1200);
  console.log(`    (advanced through: ${JSON.stringify(steps)})`);
  check('clicking NEXT fires NO conversion', (await dlCount(pg)) === 0, JSON.stringify(events));
  await ctx.close();
}

/* 2. Meta Pixel transport forms on the real page must not fire. */
{
  const { pg, ctx, events } = await session('the Meta Pixel firing on the real page');
  await pg.evaluate(() => {
    for (let i = 0; i < 3; i++) {
      const f = document.createElement('form');
      f.method = 'post';
      f.action = 'https://www.facebook.com/tr/';
      f.target = 'fb' + i;
      f.style.display = 'none';
      const ifr = document.createElement('iframe');
      ifr.src = 'about:blank'; ifr.name = 'fb' + i;
      f.appendChild(ifr);
      document.body.appendChild(f);
      f.submit();
    }
  });
  await pg.waitForTimeout(1500);
  check('pixel transport forms fire NO conversion', (await dlCount(pg)) === 0, JSON.stringify(events));
  await ctx.close();
}

/* 3. A genuine submission of the real form must fire exactly once. */
{
  const { pg, ctx, events, formPresent, blockedCount } = await session('a genuine submission of the real quote form');
  check('the quote form actually rendered', formPresent);
  await pg.evaluate(() => {
    const f = document.querySelector('.hf-form');
    if (!f) return;
    const set = (sel, v) => { const el = f.querySelector(sel); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('input[type=email], input[name*=EMAIL i], input[name*=email i]', 'Test.Person@Gmail.com');
    set('input[type=tel], input[name*=PHONE i], input[name*=phone i]', '07700 900123');
    f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await pg.waitForTimeout(2000);

  check('a real submission fires exactly ONE conversion', (await dlCount(pg)) === 1, JSON.stringify(events));
  check('the site’s own lead POST was intercepted (no enquiry sent)', blockedCount() >= 1, `blocked=${blockedCount()}`);
  const ud = events[0]?.user_data;
  if (ud) console.log(`    (user_data keys: ${Object.keys(ud).join(', ')})`);
  check('the page did not navigate', pg.url() === SITE, pg.url());
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  • ${f}`)); process.exit(1); }
