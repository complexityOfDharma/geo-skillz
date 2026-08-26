// Drives the built site in a real browser to check the things a Node render
// test cannot: clicking the overview map, neighbour chips, keyboard nav, the
// jump-to search, and hash deep links.
//
// Needs a preview server already running and a local Chrome:
//   npm run build && npm run preview      (in one shell)
//   npm run check:ui                      (in another)
//
// Not part of `npm run check` or CI, because it depends on both of those.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:4173/geo-skillz/';
const out = [];
const check = (name, ok, extra = '') => out.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForSelector('.slide-overview');
check('overview slide renders', true);
const clickable = (await page.$$('.ctx-state[data-fips]')).length;
// AlbersUsa clips Puerto Rico, Guam, American Samoa, the US Virgin Islands and
// the N. Marianas, so those geometries produce no path and are not rendered.
// What must be clickable is the 50 states plus DC.
check('exactly the 50 states are clickable', clickable === 50, `${clickable} shapes`);
check('DC is rendered but inert', (await page.$('.ctx-state.is-inert')) !== null);

// Click Texas (FIPS 48) on the overview map.
await page.click('.ctx-state[data-fips="48"]');
await page.waitForSelector('.slide-state');
check('clicking a state jumps to it', (await page.$eval('.slide-title', (e) => e.textContent)) === 'Texas');
check('url reflects the slide', page.url().endsWith('#/texas'));

// Neighbour chip navigation.
await page.click('.chip[data-goto-abbr="NM"]');
await page.waitForFunction(() => document.querySelector('.slide-title')?.textContent === 'New Mexico');
check('neighbour chip navigates', true);

// Keyboard.
const before = await page.$eval('#tb-count', (e) => e.textContent);
await page.keyboard.press('ArrowRight');
const after = await page.$eval('#tb-count', (e) => e.textContent);
check('arrow key advances', before !== after, `${before} -> ${after}`);
await page.keyboard.press('Home');
await page.waitForFunction(() => document.querySelector('.slide-overview') !== null);
check('Home returns to overview', true);

// Jump menu via "/" then search.
await page.keyboard.press('/');
await page.waitForFunction(() => !document.querySelector('.jump').hidden);
check('slash opens jump menu', true);
await page.type('.jump-input', 'richmond');
await page.waitForFunction(() => document.querySelectorAll('.jump-row').length === 1);
check('search matches on capital name', (await page.$eval('.jump-row .jump-name', (e) => e.textContent)) === 'Virginia');
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('.slide-title')?.textContent === 'Virginia');
check('enter jumps to result', true);

// Maryland borders DC, which has no slide - that chip must be inert.
await page.goto(BASE + '#/maryland', { waitUntil: 'networkidle0' });
await page.waitForSelector('.slide-state');
check('DC neighbour chip is disabled',
  await page.$eval('[data-goto-abbr="DC"]', (e) => e.disabled && e.classList.contains('is-inert')));

// Deep link straight to a feature slide.
await page.goto(BASE + '#/denali', { waitUntil: 'networkidle0' });
await page.waitForSelector('.slide-feature');
check('deep link to feature works', (await page.$$('.tl-list li')).length === 7, 'naming timeline rows');
check('disputed badge shown', (await page.$('.disputed')) !== null);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
