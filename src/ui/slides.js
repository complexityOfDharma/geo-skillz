import { contextMap, stateDetailMap, featureDetailMap } from '../lib/maps.js';

// Rendered above every slide and category page so "up" is always visible, not
// just reachable by pressing Escape.
export function breadcrumbFor(trail) {
  const parts = trail.map((step, i) => {
    const last = i === trail.length - 1;
    if (last || !step.href) return `<span class="crumb is-current">${esc(step.label)}</span>`;
    return `<a class="crumb" href="${step.href}" data-route>${esc(step.label)}</a>`;
  });
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(
    '<span class="crumb-sep" aria-hidden="true">/</span>'
  )}</nav>`;
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const list = (items, cls = '') =>
  `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const whyBlock = (text) =>
  text
    ? `<aside class="why"><h3 class="why-title">Why it matters</h3><p>${esc(text)}</p></aside>`
    : '';

const storyBlock = (parts) =>
  `<section class="story">${parts
    .filter((p) => p.text)
    .map(
      (p) =>
        `<div class="story-item"><h3 class="story-label">${esc(p.label)}</h3><p>${esc(p.text)}</p></div>`
    )
    .join('')}</section>`;

const mapPair = (contextSvg, detailSvg, contextCaption, detailCaption) =>
  `<section class="maps">
     <figure class="map-figure">${contextSvg}<figcaption>${esc(contextCaption)}</figcaption></figure>
     <figure class="map-figure">${detailSvg}<figcaption>${esc(detailCaption)}</figcaption></figure>
   </section>`;

function stateSlide(atlas, s) {
  const neighbours = s.neighboringStates.length
    ? s.neighboringStates
        .map((n) => `<button class="chip" data-goto-abbr="${esc(n)}">${esc(n)}</button>`)
        .join('')
    : '<span class="chip is-empty">none &mdash; it borders no other state</span>';

  const featureLines = s.majorFeatures
    .map(
      (f) =>
        `<li><span class="feat-name">${esc(f.name)}</span>` +
        `<span class="feat-type">${esc(f.type)}</span>` +
        `<span class="feat-note">${esc(f.note)}</span></li>`
    )
    .join('');

  return `
    <article class="slide slide-state">
      <header class="slide-head">
        <p class="eyebrow">${esc(s.region)} &middot; ${esc(s.abbreviation)}</p>
        <h1 class="slide-title">${esc(s.name)}</h1>
        <p class="slide-sub">${s.nickname ? esc(s.nickname) + ' &middot; ' : ''}Capital: <strong>${esc(
    s.capital
  )}</strong></p>
      </header>

      ${storyBlock([
        { label: 'Where the name comes from', text: s.nameStory },
        { label: `Why ${s.capital}`, text: s.capitalStory },
      ])}

      ${mapPair(
        contextMap(atlas, { highlight: [s.fips] }),
        stateDetailMap(atlas, s),
        `${s.name} within the United States`,
        `${s.name} in detail — capital and major features`
      )}

      <section class="facts">
        <div class="facts-grid">
          <div class="fact"><dt>Statehood</dt><dd>${ordinal(s.statehoodOrder)} state, ${s.statehoodYear}</dd></div>
          <div class="fact"><dt>Region</dt><dd>${esc(s.region)}</dd></div>
          <div class="fact fact-wide"><dt>Borders</dt><dd class="chips">${neighbours}</dd></div>
        </div>
        <div class="facts-cols">
          <div>
            <h3 class="panel-title">Major features</h3>
            <ul class="feature-list">${featureLines}</ul>
          </div>
          <div>
            <h3 class="panel-title">Worth knowing</h3>
            ${list(s.funFacts, 'fun-list')}
          </div>
        </div>
      </section>

      ${whyBlock(s.whyItMatters)}
    </article>`;
}

function mnemonicBlock(m) {
  if (!m) return '';
  const items = m.items
    .map(
      (i) =>
        `<li><span class="mn-letter">${esc(i.letter)}</span>` +
        `<span class="mn-label">${esc(i.label)}</span>` +
        `<span class="mn-note">${esc(i.note ?? '')}</span></li>`
    )
    .join('');
  return `
    <section class="mnemonic">
      <div class="mn-key">${esc(m.key)}</div>
      <ul class="mn-list">${items}</ul>
      ${m.note ? `<p class="mn-note-full">${esc(m.note)}</p>` : ''}
    </section>`;
}

function timelineBlock(timeline) {
  if (!timeline) return '';
  const rows = timeline
    .map(
      (t) =>
        `<li><span class="tl-year">${esc(t.year)}</span>` +
        `<span class="tl-label">${esc(t.label)}</span>` +
        `<span class="tl-detail">${esc(t.detail)}</span></li>`
    )
    .join('');
  return `
    <section class="timeline">
      <h3 class="panel-title">What it has been called</h3>
      <ul class="tl-list">${rows}</ul>
    </section>`;
}

function featureSlide(atlas, f) {
  const touched = (f.statesTouched ?? [])
    .map((a) => `<button class="chip" data-goto-abbr="${esc(a)}">${esc(a)}</button>`)
    .join('');

  return `
    <article class="slide slide-feature">
      <header class="slide-head">
        <p class="eyebrow">US geographic feature &middot; ${esc(f.type)}</p>
        <h1 class="slide-title">${esc(f.name)}${
    f.disputedName ? '<span class="disputed" title="This name is disputed">disputed name</span>' : ''
  }</h1>
        ${f.subtitle ? `<p class="slide-sub">${esc(f.subtitle)}</p>` : ''}
      </header>

      ${mnemonicBlock(f.mnemonic)}

      ${storyBlock([
        { label: 'The story', text: f.story },
        { label: 'Where the name comes from', text: f.nameStory },
      ])}

      ${mapPair(
        contextMap(atlas, { highlight: f.fipsTouched }),
        featureDetailMap(atlas, f),
        `${f.name} in national context`,
        `${f.name} up close`
      )}

      ${timelineBlock(f.namingTimeline)}

      <section class="facts">
        <div class="facts-cols">
          <div>
            <h3 class="panel-title">Key facts</h3>
            ${list(f.keyFacts, 'fun-list')}
          </div>
          <div>
            <h3 class="panel-title">States it touches</h3>
            <div class="chips">${touched || '<span class="chip is-empty">n/a</span>'}</div>
          </div>
        </div>
      </section>

      ${whyBlock(f.whyItMatters)}
    </article>`;
}

export function renderSlide(slide, atlas, breadcrumb = '') {
  const body = slide.kind === 'state' ? stateSlide(atlas, slide.data) : featureSlide(atlas, slide.data);
  return breadcrumb + body;
}
