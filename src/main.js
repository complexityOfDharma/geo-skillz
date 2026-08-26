import './style.css';
import { loadAtlas } from './lib/atlas.js';
import * as router from './lib/router.js';
import {
  sections,
  allSlides,
  states,
  getCategory,
  getSlide,
  getSlideById,
  getSlideByFips,
  getSlideByAbbr,
} from './data/index.js';
import { renderSlide, breadcrumbFor } from './ui/slides.js';
import { renderLanding } from './ui/landing.js';
import { renderCategory } from './ui/category.js';
import { createSidebar } from './ui/sidebar.js';
import { createJumpMenu } from './ui/jump.js';

const app = document.getElementById('app');

let atlas;
let stage;
let sidebar;
let jump;
let route = { kind: 'landing' };

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

  app.innerHTML = shell();
  stage = document.getElementById('stage');

  jump = createJumpMenu(allSlides, (slide) => go(routeForSlide(slide)));
  sidebar = createSidebar(sections, { onSearch: () => jump.open() });
  document.getElementById('shell').prepend(sidebar.el);

  wire();
  go(resolve(location.hash), { replace: true });
}

function shell() {
  return `
    <div class="shell" id="shell">
      <div class="content">
        <div class="toolbar">
          <button class="tb-btn tb-menu" data-open-nav aria-label="Open navigation">☰</button>
          <div class="tb-center">
            <div class="tb-line">
              <span class="tb-title" id="tb-title">&nbsp;</span>
              <span class="tb-count" id="tb-count"></span>
            </div>
            <div class="tb-progress"><div class="tb-progress-bar" id="tb-bar"></div></div>
          </div>
          <div class="tb-arrows">
            <button class="tb-btn" data-nav="prev" aria-label="Previous slide">←</button>
            <button class="tb-btn" data-nav="next" aria-label="Next slide">→</button>
          </div>
        </div>
        <main id="stage" class="stage" tabindex="-1"></main>
      </div>
    </div>`;
}

const routeForSlide = (slide) => ({
  kind: 'slide',
  sectionId: slide.sectionId,
  categoryId: slide.categoryId,
  slideId: slide.id,
});

// Turn a hash into a route we can actually render, rewriting the flat routes the
// first build shipped (#/virginia) onto their new hierarchical path.
function resolve(hash) {
  const parsed = router.parse(hash);
  if (parsed.kind === 'legacy') {
    const slide = getSlideById(parsed.id);
    return slide ? routeForSlide(slide) : { kind: 'landing' };
  }
  if (parsed.kind === 'category' && !getCategory(parsed.sectionId, parsed.categoryId)) {
    return { kind: 'landing' };
  }
  if (parsed.kind === 'slide' && !getSlide(parsed.sectionId, parsed.categoryId, parsed.slideId)) {
    const slide = getSlideById(parsed.slideId);
    return slide ? routeForSlide(slide) : { kind: 'landing' };
  }
  return parsed;
}

function trailFor(current) {
  const trail = [{ label: 'Home', href: '#/' }];
  if (current.kind === 'landing') return trail;

  const category = getCategory(current.sectionId, current.categoryId);
  const section = sections.find((s) => s.id === current.sectionId);
  if (section) trail.push({ label: section.title });
  if (category) {
    trail.push({
      label: category.title,
      href: router.format({
        kind: 'category',
        sectionId: category.sectionId,
        categoryId: category.id,
      }),
    });
  }
  if (current.kind === 'slide') {
    const slide = getSlide(current.sectionId, current.categoryId, current.slideId);
    if (slide) trail.push({ label: slide.title });
  }
  return trail;
}

function go(next, { replace = false } = {}) {
  route = next;
  const crumb = breadcrumbFor(trailFor(route));

  let title = 'Geo Skillz';
  let counter = '';
  let progress = 0;

  if (route.kind === 'landing') {
    stage.innerHTML = renderLanding(sections);
    sidebar.setActive('home');
  } else if (route.kind === 'category') {
    const category = getCategory(route.sectionId, route.categoryId);
    stage.innerHTML = renderCategory(category, atlas, crumb);
    title = category.title;
    sidebar.setActive(`${category.sectionId}/${category.id}`);
  } else {
    const slide = getSlide(route.sectionId, route.categoryId, route.slideId);
    const category = getCategory(route.sectionId, route.categoryId);
    stage.innerHTML = renderSlide(slide, atlas, crumb);
    title = slide.title;
    // Counter is scoped to the category, so Virginia reads 46 / 50 rather than
    // giving a position in one undifferentiated pile of everything.
    counter = `${slide.indexInCategory + 1} / ${category.count}`;
    progress = ((slide.indexInCategory + 1) / category.count) * 100;
    sidebar.setActive(`${category.sectionId}/${category.id}`);
  }

  // DC is a genuine neighbour of Maryland and Virginia but has no slide of its
  // own, so its chip should not look or behave like a link.
  for (const chip of stage.querySelectorAll('[data-goto-abbr]')) {
    if (!getSlideByAbbr(chip.dataset.gotoAbbr)) {
      chip.classList.add('is-inert');
      chip.disabled = true;
    }
  }

  document.getElementById('tb-title').textContent = title;
  document.getElementById('tb-count').textContent = counter;
  document.getElementById('tb-bar').style.width = `${progress}%`;
  // Arrows and the progress track only mean anything on a slide.
  const isSlide = route.kind === 'slide';
  document.querySelector('.tb-arrows').hidden = !isSlide;
  document.querySelector('.tb-progress').hidden = !isSlide;

  stage.scrollTop = 0;
  window.scrollTo(0, 0);

  const hash = router.format(route);
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
  }
}

// Prev/next stay inside the current category.
function step(delta) {
  if (route.kind !== 'slide') return;
  const category = getCategory(route.sectionId, route.categoryId);
  const slide = getSlide(route.sectionId, route.categoryId, route.slideId);
  const next = category.slides[slide.indexInCategory + delta];
  if (next) go(routeForSlide(next));
}

function up() {
  const parent = router.parentOf(route);
  if (parent) go(parent);
}

function wire() {
  document.querySelector('.toolbar').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) return step(nav.dataset.nav === 'next' ? 1 : -1);
    if (e.target.closest('[data-open-nav]')) sidebar.open();
  });

  // Delegated so every data-route link in any view just works.
  document.getElementById('shell').addEventListener('click', (e) => {
    const link = e.target.closest('a[data-route]');
    if (link) {
      e.preventDefault();
      return go(resolve(link.getAttribute('href')));
    }
    const chip = e.target.closest('[data-goto-abbr]');
    if (chip) {
      const slide = getSlideByAbbr(chip.dataset.gotoAbbr);
      if (slide) go(routeForSlide(slide));
      return;
    }
    const shape = e.target.closest('[data-fips]');
    if (shape) {
      const slide = getSlideByFips(shape.dataset.fips);
      if (slide) go(routeForSlide(slide));
    }
  });

  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const shape = e.target.closest('[data-fips]');
    if (!shape) return;
    e.preventDefault();
    const slide = getSlideByFips(shape.dataset.fips);
    if (slide) go(routeForSlide(slide));
  });

  window.addEventListener('keydown', (e) => {
    if (jump.isOpen() || e.target.matches('input, textarea')) return;
    if (e.key === 'Escape') {
      if (sidebar.isOpen()) return sidebar.close();
      e.preventDefault();
      return up();
    }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); go({ kind: 'landing' }); }
    else if (e.key === '/') { e.preventDefault(); jump.open(); }
  });

  window.addEventListener('popstate', () => go(resolve(location.hash), { replace: true }));
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
    step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// Reachable from the console while studying, and proof the data layer works
// without the UI - which is exactly how a future quiz mode would consume it.
if (import.meta.env.DEV) window.geoSkillz = { sections, allSlides, states };
