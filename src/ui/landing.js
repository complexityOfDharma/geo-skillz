import { format } from '../lib/router.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tile(category) {
  const href = format({ kind: 'category', sectionId: category.sectionId, categoryId: category.id });
  return `
    <a class="tile" href="${href}" data-route>
      <span class="tile-icon" aria-hidden="true">${esc(category.icon ?? '')}</span>
      <span class="tile-title">${esc(category.title)}</span>
      <span class="tile-count">${category.count} ${category.count === 1 ? 'slide' : 'slides'}</span>
      <span class="tile-blurb">${esc(category.blurb)}</span>
    </a>`;
}

function plannedTile(section) {
  return `
    <div class="tile is-planned" aria-disabled="true">
      <span class="tile-icon" aria-hidden="true">🌍</span>
      <span class="tile-title">${esc(section.title)}</span>
      <span class="tile-count">Coming soon</span>
      <span class="tile-blurb">The same six categories, applied to the whole map.</span>
    </div>`;
}

function sectionBlock(section) {
  const body =
    section.status === 'planned'
      ? plannedTile(section)
      : section.categories.map(tile).join('');

  return `
    <section class="section-card${section.status === 'planned' ? ' is-planned' : ''}">
      <header class="section-head">
        <h2 class="section-title">${esc(section.title)}</h2>
        <p class="section-blurb">${esc(section.blurb)}</p>
      </header>
      <div class="tile-grid">${body}</div>
    </section>`;
}

export function renderLanding(sections) {
  const live = sections.filter((s) => s.status !== 'planned');
  const slideCount = live.reduce(
    (n, s) => n + s.categories.reduce((m, c) => m + c.count, 0),
    0
  );

  return `
    <article class="page page-landing">
      <header class="page-head">
        <p class="eyebrow">Geography study deck</p>
        <h1 class="page-title">Geo Skillz</h1>
        <p class="page-sub">
          ${slideCount} slides. Every one leads with a story, because names stick when they mean
          something — then the facts have somewhere to attach.
        </p>
      </header>
      ${sections.map(sectionBlock).join('')}
    </article>`;
}
