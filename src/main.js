import './style.css';
import { loadAtlas } from './lib/atlas.js';
import { buildDeck, stateByAbbr, states } from './data/index.js';
import { renderSlide } from './ui/slides.js';
import { createJumpMenu } from './ui/jump.js';

const deck = buildDeck();
const app = document.getElementById('app');
const indexById = new Map(deck.map((s, i) => [s.id, i]));
const fipsToIndex = new Map(
  deck.filter((s) => s.kind === 'state').map((s) => [s.data.fips, indexById.get(s.id)])
);

let atlas;
let current = 0;
let stage;
let jump;

init();

async function init() {
  try {
    atlas = await loadAtlas();
  } catch (err) {
    app.innerHTML =
      `<div class="boot boot-error"><p>Could not load the map data.</p>` +
      `<p class="boot-detail">${err.message}</p></div>`;
    return;
  }
  app.innerHTML = chrome();
  stage = document.getElementById('stage');
  jump = createJumpMenu(deck, (i) => go(i));
  wire();
  go(indexFromHash(), { replace: true });
}

function chrome() {
  return `
    <div class="toolbar">
      <button class="tb-btn" data-nav="prev" aria-label="Previous slide">&larr;</button>
      <div class="tb-center">
        <button class="tb-jump" data-open-jump aria-haspopup="dialog">
          <span class="tb-title" id="tb-title">&nbsp;</span>
          <span class="tb-count" id="tb-count"></span>
        </button>
        <div class="tb-progress"><div class="tb-progress-bar" id="tb-bar"></div></div>
      </div>
      <button class="tb-btn" data-nav="next" aria-label="Next slide">&rarr;</button>
    </div>
    <main id="stage" class="stage" tabindex="-1"></main>`;
}

function go(i, { replace = false } = {}) {
  current = Math.max(0, Math.min(deck.length - 1, i));
  const slide = deck[current];
  stage.innerHTML = renderSlide(slide, atlas, deck);
  stage.scrollTop = 0;
  window.scrollTo(0, 0);

  document.getElementById('tb-title').textContent = slide.title;
  document.getElementById('tb-count').textContent = `${current + 1} / ${deck.length}`;
  document.getElementById('tb-bar').style.width = `${((current + 1) / deck.length) * 100}%`;

  const hash = `#/${slide.id}`;
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
  }
}

const next = () => go(current + 1);
const prev = () => go(current - 1);

function indexFromHash() {
  return indexById.get(location.hash.replace(/^#\/?/, '')) ?? 0;
}

function gotoFips(fips) {
  const i = fipsToIndex.get(fips);
  if (i !== undefined) go(i);
}

function wire() {
  document.querySelector('.toolbar').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return nav.dataset.nav === 'next' ? next() : prev();
    if (e.target.closest('[data-open-jump]')) jump.open();
  });

  // Clicks inside a slide: the overview map, and the neighbour chips.
  stage.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-goto-abbr]');
    if (chip) return gotoFips(stateByAbbr.get(chip.dataset.gotoAbbr)?.fips);
    const shape = e.target.closest('[data-fips]');
    if (shape) gotoFips(shape.dataset.fips);
  });

  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const shape = e.target.closest('[data-fips]');
    if (!shape) return;
    e.preventDefault();
    gotoFips(shape.dataset.fips);
  });

  window.addEventListener('keydown', (e) => {
    if (jump.isOpen() || e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(deck.length - 1); }
    else if (e.key === '/') { e.preventDefault(); jump.open(); }
  });

  window.addEventListener('popstate', () => go(indexFromHash(), { replace: true }));
  wireSwipe();
}

function wireSwipe() {
  let x0 = null, y0 = 0, t0 = 0;
  stage.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    x0 = null;
    // Must be horizontal, decisive, and quick - otherwise it was a scroll.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (Date.now() - t0 > 700) return;
    dx < 0 ? next() : prev();
  }, { passive: true });
}

// Reachable from the console while studying, and proof the data layer works
// without the UI - which is exactly how a future quiz mode would consume it.
if (import.meta.env.DEV) window.geoSkillz = { deck, states };
