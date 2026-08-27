// Drives the built site in a real browser to check the things a Node render
// test cannot: the landing page, category navigation, backing out of a slide,
// clicking the overview map, keyboard nav, jump-to search and deep links.
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
const check = (name, ok, extra = '') =>
  out.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const title = () => page.$eval('.page-title, .slide-title', (e) => e.textContent.trim());
const goto = (hash) => page.goto(BASE + hash, { waitUntil: 'networkidle0' });

// ---- landing ----
await goto('');
await page.waitForSelector('.page-landing');
check('landing renders', true);
check(
  'seven category tiles + one planned',
  (await page.$$('.tile')).length === 8 && (await page.$$('.tile.is-planned')).length === 1
);
check('sidebar lists every category', (await page.$$('.sidebar [data-category]')).length === 8);

// ---- landing -> category -> slide ----
await page.click('.tile[href="#/us/states"]');
await page.waitForSelector('.page-category');
check('States tile opens the states index', (await title()) === 'States');
check('states index has 50 cards', (await page.$$('.card')).length === 50);

await page.click('.ctx-state[data-fips="48"]');
await page.waitForSelector('.slide-state');
check('clicking Texas on the map opens Texas', (await title()) === 'Texas');
check('url is hierarchical', page.url().endsWith('#/us/states/texas'));
check(
  'counter is scoped to the category',
  (await page.$eval('#tb-count', (e) => e.textContent)) === '43 / 50',
  await page.$eval('#tb-count', (e) => e.textContent)
);

// ---- backing out: the thing that was broken ----
await page.keyboard.press('Escape');
await page.waitForSelector('.page-category');
check('Escape from a slide returns to the category', (await title()) === 'States');
await page.keyboard.press('Escape');
await page.waitForSelector('.page-landing');
check('Escape again returns to the landing page', true);

// ---- breadcrumb ----
await goto('#/us/landforms/denali');
await page.waitForSelector('.slide-feature');
check('deep link to a feature slide works', (await title()).startsWith('Denali'));
check('breadcrumb shows the full trail', (await page.$$('.breadcrumb .crumb')).length === 4);
await page.click('.breadcrumb a.crumb:nth-of-type(2)');
await page.waitForSelector('.page-category');
check('breadcrumb navigates to the category', (await title()) === 'Landforms');

// ---- small category scoping ----
await goto('#/us/cities');
await page.waitForSelector('.page-category');
check('Cities & Population is populated', (await page.$$('.card')).length === 4);
await page.click('.card');
await page.waitForSelector('.slide-feature');
check('small category counter', (await page.$eval('#tb-count', (e) => e.textContent)) === '1 / 4');
await page.keyboard.press('ArrowRight');
await page.waitForFunction(() => document.querySelector('#tb-count').textContent === '2 / 4');
check('arrow key advances within the category', true);

// ---- sidebar from deep inside ----
await page.click('.sidebar .nav-home');
await page.waitForSelector('.page-landing');
check('sidebar Home works from a slide', true);

// ---- search ----
await page.keyboard.press('/');
await page.waitForFunction(() => !document.querySelector('.jump').hidden);
await page.type('.jump-input', 'richmond');
await page.waitForFunction(() => document.querySelectorAll('.jump-row').length === 1);
check('search matches on capital name', (await page.$eval('.jump-row .jump-name', (e) => e.textContent)) === 'Virginia');
await page.keyboard.press('Enter');
await page.waitForSelector('.slide-state');
check('search result opens the slide', (await title()) === 'Virginia');

// ---- legacy deep links from the first build ----
await goto('#/wyoming');
await page.waitForSelector('.slide-state');
check('legacy flat link still resolves', (await title()) === 'Wyoming');
check('legacy link is rewritten', page.url().endsWith('#/us/states/wyoming'), page.url().split('#')[1]);

// ---- map tooltips ----
await goto('#/us/states/oklahoma');
await page.waitForSelector('.slide-state');
check(
  'subject state has a hover title',
  (await page.$eval('.detail-subject title', (e) => e.textContent)) === 'Oklahoma'
);
// Clipping the projection means off-screen states emit no path at all, so
// assert every rendered one carries a title rather than a fixed count.
const nb = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.map-detail .detail-neighbor')];
  return { total: paths.length, titled: paths.filter((p) => p.querySelector('title')).length };
});
check(
  'every rendered neighbour state has a hover title',
  nb.total > 3 && nb.titled === nb.total,
  `${nb.titled}/${nb.total}`
);
check(
  'no country outline at Oklahoma zoom',
  (await page.$$('.detail-abroad')).length === 0
);
// Every neighbour label must sit outside the highlighted state.
const overlap = await page.evaluate(() => {
  const svg = document.querySelector('.map-detail');
  const subject = svg.querySelector('.detail-subject');
  return [...svg.querySelectorAll('.state-label')].filter((t) => {
    const b = t.getBBox();
    const pt = svg.createSVGPoint();
    pt.x = b.x + b.width / 2;
    pt.y = b.y + b.height / 2;
    return subject.isPointInFill(pt);
  }).map((t) => t.textContent);
});
check('no neighbour label sits inside the subject state', overlap.length === 0, overlap.join(','));

// Texas reaches Mexico, so the country layer is exercised there.
await goto('#/us/states/texas');
await page.waitForSelector('.slide-state');
check(
  'country outlines are hoverable',
  await page.$eval('.detail-abroad', (e) => getComputedStyle(e).pointerEvents !== 'none')
);
check(
  'country outlines have hover titles',
  (await page.$eval('.detail-abroad title', (e) => e.textContent)).length > 0
);
const txOverlap = await page.evaluate(() => {
  const svg = document.querySelector('.map-detail');
  const subject = svg.querySelector('.detail-subject');
  return [...svg.querySelectorAll('.state-label, .country-label')].filter((t) => {
    const b = t.getBBox();
    const pt = svg.createSVGPoint();
    pt.x = b.x + b.width / 2;
    pt.y = b.y + b.height / 2;
    return subject.isPointInFill(pt);
  }).map((t) => t.textContent);
});
check('no neighbour or country label sits inside Texas', txOverlap.length === 0, txOverlap.join(','));

// ---- state close-up glyphs ----
await goto('#/us/states/kentucky');
await page.waitForSelector('.slide-state');
const ky = await page.evaluate(() => ({
  caps: document.querySelectorAll('.map-detail .glyph-capital').length,
  cities: document.querySelectorAll('.map-detail .glyph-city').length,
  marks: [...document.querySelectorAll('.map-detail .marker')]
    .filter((g) => g.querySelector('.glyph-landmark'))
    .map((g) => g.querySelector('text').textContent),
}));
check('exactly one capital star', ky.caps === 1, String(ky.caps));
check('city dots present', ky.cities >= 2, String(ky.cities));
check(
  'landmark squares are point places only',
  ky.marks.length === 2 && ky.marks.includes('Mammoth Cave') && ky.marks.includes('Cumberland Gap'),
  ky.marks.join(', ')
);

// California's features are all ranges, valleys and faults - areas and lines,
// so none of them may get a square.
await goto('#/us/states/california');
await page.waitForSelector('.slide-state');
check(
  'no square for ranges or valleys',
  (await page.$$('.map-detail .glyph-landmark')).length === 0
);

// ---- inert affordances ----
await goto('#/us/states/maryland');
await page.waitForSelector('.slide-state');
check(
  'DC neighbour chip is disabled',
  await page.$eval('[data-goto-abbr="DC"]', (e) => e.disabled && e.classList.contains('is-inert'))
);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(out.join('\n'));
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
