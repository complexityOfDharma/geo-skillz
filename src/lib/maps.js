import { contextProjection, zoomProjection, bboxFeature, graticuleFor, pathFor } from './geo.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const svgOpen = (w, h, cls) =>
  `<svg class="${cls}" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">`;

// Nudges labels apart vertically so short feature names don't stack on top of
// each other. Good enough for the 3-6 labels a slide actually carries.
function spread(items, minGap, height) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const item of sorted) {
    item.labelY = Math.max(item.y, last + minGap);
    last = item.labelY;
  }
  const overflow = last - (height - 8);
  if (overflow > 0) for (const item of sorted) item.labelY -= overflow;
  return items;
}

function labelMarkup(items, width) {
  return items
    .map((m) => {
      const right = m.x > width * 0.55;
      const tx = right ? m.x - 9 : m.x + 9;
      return (
        `<g class="marker">` +
        `<line class="marker-leader" x1="${m.x}" y1="${m.y}" x2="${tx}" y2="${m.labelY}" />` +
        `<circle class="marker-dot" cx="${m.x}" cy="${m.y}" r="3.5" />` +
        `<text class="marker-label" x="${tx}" y="${m.labelY}" dy="0.32em" ` +
        `text-anchor="${right ? 'end' : 'start'}">${esc(m.name)}</text>` +
        `</g>`
      );
    })
    .join('');
}

function project(projection, markers, width, height) {
  const placed = [];
  for (const m of markers ?? []) {
    const pt = projection(m.coords);
    // AlbersUsa returns null for anything outside its frame; skip rather than
    // rendering NaN coordinates.
    if (!pt || !Number.isFinite(pt[0])) continue;
    placed.push({ ...m, x: pt[0], y: pt[1] });
  }
  // Gap is in SVG units, so it must clear the largest label size any breakpoint
  // uses - phones scale the whole SVG down and compensate with bigger type.
  return spread(placed, 24, height);
}

// Tier 1: the whole country, with the subject filled and everything else muted.
export function contextMap(
  atlas,
  { highlight = [], interactive = false, clickable = null, width = 820, height = 500 } = {}
) {
  const projection = contextProjection(atlas.nation, width, height);
  const path = pathFor(projection);
  const hot = new Set(highlight);
  // Only shapes that actually have a slide should invite a click. DC is in the
  // atlas and is a real neighbour of Maryland and Virginia, but has no slide.
  const canClick = clickable ? new Set(clickable) : null;

  const shapes = atlas.states.features
    .map((f) => {
      const d = path(f);
      if (!d) return '';
      const on = hot.has(f.id);
      const navigable = interactive && (!canClick || canClick.has(f.id));
      const attrs = navigable
        ? ` tabindex="0" role="button" data-fips="${f.id}" aria-label="${esc(f.properties.name)}"`
        : '';
      const cls = `ctx-state${on ? ' is-active' : ''}${
        interactive && !navigable ? ' is-inert' : ''
      }`;
      return `<path class="${cls}" d="${d}"${attrs}><title>${esc(f.properties.name)}</title></path>`;
    })
    .join('');

  return (
    svgOpen(width, height, `map map-context${interactive ? ' is-interactive' : ''}`) +
    shapes +
    `<path class="ctx-nation" d="${path(atlas.nation)}" />` +
    `</svg>`
  );
}

// Tier 2: zoomed to one state, with its capital and named features.
export function stateDetailMap(atlas, state, { width = 820, height = 520 } = {}) {
  const target = atlas.byFips.get(state.fips);
  if (!target) return `<p class="map-missing">No map geometry for ${esc(state.name)}.</p>`;

  const projection = zoomProjection(target, width, height);
  const path = pathFor(projection);

  // Neighbors give the zoom some context; SVG clips whatever falls outside.
  const around = atlas.states.features
    .filter((f) => f.id !== state.fips)
    .map((f) => (path(f) ? `<path class="detail-neighbor" d="${path(f)}" />` : ''))
    .join('');

  const markers = project(
    projection,
    [
      { name: `${state.capital} (capital)`, coords: state.capitalCoords, isCapital: true },
      ...state.majorFeatures.filter((f) => f.coords),
    ],
    width,
    height
  );

  const capital = markers.find((m) => m.isCapital);
  const capitalStar = capital
    ? `<circle class="capital-halo" cx="${capital.x}" cy="${capital.y}" r="8" />`
    : '';

  return (
    svgOpen(width, height, 'map map-detail') +
    around +
    `<path class="detail-subject" d="${path(target)}" />` +
    capitalStar +
    labelMarkup(markers, width) +
    `</svg>`
  );
}

// Tier 2 for cross-state features: zoom to the declared bounding box.
export function featureDetailMap(atlas, item, { width = 820, height = 520 } = {}) {
  const frame = bboxFeature(item.focus.bbox);
  const projection = zoomProjection(frame, width, height, 14);
  const path = pathFor(projection);
  // fipsTouched is resolved from statesTouched by the deck builder, because
  // us-atlas geometries carry a FIPS id and a name but no postal abbreviation.
  const touched = new Set(item.fipsTouched ?? []);

  const shapes = atlas.states.features
    .map((f) => {
      const d = path(f);
      if (!d) return '';
      const on = touched.has(f.id);
      return `<path class="detail-neighbor${on ? ' is-touched' : ''}" d="${d}"><title>${esc(
        f.properties.name
      )}</title></path>`;
    })
    .join('');

  const markers = project(projection, item.markers, width, height);
  const grid = path(graticuleFor(item.focus.bbox));

  return (
    svgOpen(width, height, 'map map-detail') +
    shapes +
    // Above the land, not below it - an opaque state fill would hide it.
    (grid ? `<path class="graticule" d="${grid}" />` : '') +
    labelMarkup(markers, width) +
    `</svg>`
  );
}
