import { contextMap } from '../lib/maps.js';
import { format } from '../lib/router.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const slideHref = (slide) =>
  format({
    kind: 'slide',
    sectionId: slide.sectionId,
    categoryId: slide.categoryId,
    slideId: slide.id,
  });

function card(slide) {
  const meta = slide.kind === 'state' ? `Capital: ${slide.subtitle}` : slide.subtitle ?? '';
  return `
    <a class="card" href="${slideHref(slide)}" data-route>
      <span class="card-title">${esc(slide.title)}</span>
      ${meta ? `<span class="card-meta">${esc(meta)}</span>` : ''}
    </a>`;
}

export function renderCategory(category, atlas, breadcrumb) {
  // The states index keeps the clickable national map - it is the fastest way in
  // if you know where a state is but not what it is called.
  const map =
    category.kind === 'states'
      ? `<figure class="map-figure map-figure-wide">
           ${contextMap(atlas, {
             interactive: true,
             clickable: category.slides.map((s) => s.data.fips),
             width: 900,
             height: 560,
           })}
           <figcaption>Click or tap a state, or pick one from the list below.</figcaption>
         </figure>`
      : '';

  return `
    <article class="page page-category">
      ${breadcrumb}
      <header class="page-head">
        <p class="eyebrow">${category.count} ${category.count === 1 ? 'slide' : 'slides'}</p>
        <h1 class="page-title">${esc(category.title)}</h1>
        <p class="page-sub">${esc(category.blurb)}</p>
      </header>
      ${map}
      <div class="card-grid">${category.slides.map(card).join('')}</div>
    </article>`;
}
