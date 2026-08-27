import { contextProjection, zoomProjection, bboxFeature, boundsOfParts, graticuleFor, pathFor } from './geo.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Natural Earth stores some names in caps ("SONORAN DESERT"). Title-case those
// for display; anything already mixed-case is left exactly as authored so
// "Route 66" and "Lake Erie" survive untouched.
const titleCase = (s) =>
  s === s.toUpperCase()
    ? s.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    : s;

const displayName = (item, name) => item.geometry?.labels?.[name] ?? titleCase(name);

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
  { highlight = [], interactive = false, clickable = null, shapeParts = null, kind = 'polygon', width = 820, height = 500 } = {}
) {
  const projection = contextProjection(atlas.nation, width, height);
  const path = pathFor(projection);
  // When the feature has geometry of its own, draw THAT on the national map
  // rather than colouring in the states around it.
  const overlay = shapeParts?.length ? shapeParts : null;
  const hot = new Set(overlay ? [] : highlight);
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

  const drawn = overlay
    ? overlay
        .map((part) => {
          const d = path(part.geometry);
          return d ? `<path class="${kind === 'line' ? 'feat-line' : 'feat-shape'} is-ctx" d="${d}" />` : '';
        })
        .join('')
    : '';

  return (
    svgOpen(width, height, `map map-context${interactive ? ' is-interactive' : ''}`) +
    shapes +
    `<path class="ctx-nation" d="${path(atlas.nation)}" />` +
    drawn +
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

// Tier 2 for cross-state features: zoom to the declared bounding box and draw
// the feature ITSELF - the lakes, the canyon, the route - rather than
// approximating it with the states around it.
export function featureDetailMap(atlas, item, { width = 820, height = 520 } = {}) {
  const parts = item.geometryParts ?? [];
  const hasShape = parts.length > 0;

  // Frame on the geometry when we have it; fall back to the declared bbox for
  // the features that are genuinely defined by their states.
  const bbox = boundsOfParts(parts, item.markers) ?? item.focus.bbox;
  const frame = bboxFeature(bbox);
  const projection = zoomProjection(frame, width, height, 14);
  const path = pathFor(projection);
  const touched = new Set(item.fipsTouched ?? []);

  // Base layer: every state in muted grey. When the feature has real geometry
  // the states are pure context, so nothing gets a highlight fill - the fill
  // fallback is only for features that genuinely ARE defined by states
  // (the Sun Belt, BosWash, Tornado Alley).
  const base = atlas.states.features
    .map((f) => {
      const d = path(f);
      if (!d) return '';
      const on = touched.has(f.id) && !hasShape;
      return `<path class="detail-neighbor${on ? ' is-touched' : ''}" d="${d}"><title>${esc(
        f.properties.name
      )}</title></path>`;
    })
    .join('');

  // Grey names on the states the feature passes through. Full name where it
  // fits inside the state's projected width, postal abbreviation where it
  // doesn't - otherwise a 14-state route turns into a pile of overlapping text.
  const stateLabels = (item.touchedStates ?? [])
    .map((st) => {
      const geo = atlas.byFips.get(st.fips);
      if (!geo) return '';
      const [cx, cy] = path.centroid(geo);
      if (!Number.isFinite(cx)) return '';
      // A state whose centre is off-frame would render as a clipped fragment.
      if (cx < 4 || cy < 4 || cx > width - 4 || cy > height - 4) return '';
      const [[x0], [x1]] = [path.bounds(geo)[0], path.bounds(geo)[1]];
      const room = x1 - x0;
      const text = st.name.length * 6.4 < room ? st.name : st.abbr;
      return `<text class="state-label" x="${cx.toFixed(1)}" y="${cy.toFixed(
        1
      )}" text-anchor="middle" dy="0.32em">${esc(text)}</text>`;
    })
    .join('');

  // The feature itself: thick bold outline over a semi-transparent fill.
  const shapeClass = item.geometry?.kind === 'line' ? 'feat-line' : 'feat-shape';
  const drawn = parts
    .map((part) => {
      const d = path(part.geometry);
      return d ? `<path class="${shapeClass}" d="${d}"><title>${esc(displayName(item, part.name))}</title></path>` : '';
    })
    .join('');

  // Shape labels and point markers compete for the same space, so they go
  // through one collision pass together rather than being placed independently
  // and landing on top of each other.
  const labelItems = [];

  if (item.geometry?.labelParts !== false && hasShape) {
    // One label per distinct name, on that name's largest part - so the five
    // Great Lakes each get labelled, but a river split into three segments does
    // not get labelled three times.
    const best = new Map();
    for (const part of parts) {
      const [cx, cy] = path.centroid(part.geometry);
      if (!Number.isFinite(cx)) continue;
      const size = Math.abs(path.area(part.geometry)) || path.measure(part.geometry);
      const prev = best.get(part.name);
      if (!prev || size > prev.size)
        best.set(part.name, { name: displayName(item, part.name), x: cx, y: cy, size, isPart: true });
    }
    labelItems.push(...best.values());
  }

  // A marker that merely repeats a shape's own label is noise - "Superior"
  // sitting on top of "Lake Superior".
  const partNames = parts.map((p) => p.name.toLowerCase());
  for (const m of item.markers ?? []) {
    const n = m.name.toLowerCase();
    if (partNames.some((p) => p.includes(n) || n.includes(p))) continue;
    const pt = projection(m.coords);
    if (!pt || !Number.isFinite(pt[0])) continue;
    labelItems.push({ ...m, x: pt[0], y: pt[1] });
  }

  const placed = spread(labelItems, 20, height);
  const labels = placed
    .map((l) => {
      const moved = Math.abs(l.labelY - l.y) > 5;
      if (l.isPart) {
        return (
          `<g class="marker">` +
          (moved
            ? `<line class="marker-leader" x1="${l.x}" y1="${l.y}" x2="${l.x}" y2="${l.labelY}" />`
            : '') +
          `<text class="feat-label" x="${l.x.toFixed(1)}" y="${l.labelY.toFixed(
            1
          )}" text-anchor="middle" dy="0.32em">${esc(l.name)}</text></g>`
        );
      }
      const right = l.x > width * 0.55;
      const tx = right ? l.x - 9 : l.x + 9;
      return (
        `<g class="marker">` +
        `<line class="marker-leader" x1="${l.x}" y1="${l.y}" x2="${tx}" y2="${l.labelY}" />` +
        `<circle class="marker-dot" cx="${l.x}" cy="${l.y}" r="3.5" />` +
        `<text class="marker-label" x="${tx}" y="${l.labelY}" dy="0.32em" ` +
        `text-anchor="${right ? 'end' : 'start'}">${esc(l.name)}</text></g>`
      );
    })
    .join('');

  const grid = path(graticuleFor(bbox));

  return (
    svgOpen(width, height, 'map map-detail') +
    base +
    (grid ? `<path class="graticule" d="${grid}" />` : '') +
    stateLabels +
    drawn +
    labels +
    `</svg>`
  );
}
