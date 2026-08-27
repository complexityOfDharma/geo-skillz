import {
  contextProjection,
  worldProjection,
  zoomProjection,
  bboxFeature,
  boundsOfParts,
  graticuleFor,
  pathFor,
} from './geo.js';
import { geoGraticule10 } from 'd3-geo';

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
  `<svg class="${cls}" viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="xMidYMid meet">` +
  `<rect class="map-water" x="0" y="0" width="${w}" height="${h}" />`;

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

// Grey names on states, used by both close-up maps.
//
// The projection is clipped to the viewport, so path.centroid() returns the
// centroid of the part of the state that is actually VISIBLE, and path.area()
// its visible area. That matters because a neighbour wrapping around the
// subject - Texas under Oklahoma - has a bounding box centred inside the
// subject, and averaging its outline points is dragged toward whichever border
// happens to carry the most vertices.
function greyStateLabels(path, list, atlas, width, height, skipFips) {
  return (list ?? [])
    .map((st) => {
      if (st.fips === skipFips) return '';
      const geo = atlas.byFips.get(st.fips);
      if (!geo) return '';

      const area = Math.abs(path.area(geo));
      if (area < 700) return '';

      const [cx, cy] = path.centroid(geo);
      if (!Number.isFinite(cx)) return '';

      const [[x0], [x1]] = path.bounds(geo);
      const text = st.name.length * 6.6 < (x1 - x0) * 0.72 ? st.name : st.abbr;
      // Keep the whole label inside the frame, allowing for its own width -
      // a fixed margin still clipped "Missouri" against the left edge.
      const half = text.length * 3.3 + 4;
      const lx = Math.min(Math.max(cx, half), width - half);

      return `<text class="state-label" x="${lx.toFixed(1)}" y="${cy.toFixed(
        1
      )}" text-anchor="middle" dy="0.32em">${esc(text)}</text>`;
    })
    .join('');
}

// Canada and Mexico on close-up maps. Deliberately absent from the national
// context map, which uses AlbersUsa and relocates Alaska and Hawaii into insets
// - drawing real neighbours against fake placement would lie.
//
// Returns shapes and labels separately: the outlines belong underneath the
// states, but the labels must go on top or the subject state paints over them.
let hatchSeq = 0;
// Tile size of the neighbouring-country crosshatch, in SVG units.
const HATCH_TILE = 13;

function abroad(path, atlas, width, height) {
  const shapes = [];
  const labels = [];
  // Pattern ids are document-global, so each SVG mints its own.
  const hatchId = `abroad-hatch-${++hatchSeq}`;
  for (const [name, geom] of Object.entries(atlas.context ?? {})) {
    const d = path(geom);
    if (!d) continue;
    // Same land colour as the states, differentiated by a light crosshatch
    // rather than a darker fill - a darker fill reads as a hole in the map.
    shapes.push(
      `<path class="detail-abroad" d="${d}"><title>${esc(name)}</title></path>` +
        `<path class="detail-abroad-hatch" d="${d}" fill="url(#${hatchId})" />`
    );

    // Same clipped-centroid logic as the states.
    const area = Math.abs(path.area(geom));
    if (area < 2600) continue;
    const [cx, cy] = path.centroid(geom);
    if (!Number.isFinite(cx)) continue;
    const half = name.length * 3.6 + 6;
    const lx = Math.min(Math.max(cx, half), width - half);
    const ly = Math.min(Math.max(cy, 14), height - 14);

    labels.push(
      `<text class="country-label" x="${lx.toFixed(1)}" y="${ly.toFixed(
        1
      )}" text-anchor="middle" dy="0.32em">${esc(name)}</text>`
    );
  }
  const defs = shapes.length
    ? `<defs><pattern id="${hatchId}" width="${HATCH_TILE}" height="${HATCH_TILE}" patternUnits="userSpaceOnUse">` +
      `<path class="hatch-line" d="M0,0 L${HATCH_TILE},${HATCH_TILE} M${HATCH_TILE},0 L0,${HATCH_TILE}" />` +
      `</pattern></defs>`
    : '';

  return { defs, shapes: shapes.join(''), labels: labels.join('') };
}

// Five-pointed star, centred on (x, y). Used only for capitals.
function starPath(x, y, outer = 7, inner = 2.9) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

// Three marker kinds on a state close-up: a star for the capital, a dot for
// other cities, and a hollow square for a landmark - but only where the
// landmark is genuinely a single place. A mountain RANGE gets no marker,
// because a dot in the middle of the Appalachians means nothing.
function glyph(kind, x, y) {
  if (kind === 'capital') return `<path class="glyph-capital" d="${starPath(x, y)}" />`;
  if (kind === 'landmark')
    return `<rect class="glyph-landmark" x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(
      1
    )}" width="8" height="8" />`;
  return `<circle class="glyph-city" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" />`;
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
  // Clip to the viewport so centroid/area calculations describe what is on
  // screen, not the whole state.
  projection.clipExtent([[0, 0], [width, height]]);
  const path = pathFor(projection);

  // Neighbors give the zoom some context; SVG clips whatever falls outside.
  const around = atlas.states.features
    .filter((f) => f.id !== state.fips)
    .map((f) => {
      const d = path(f);
      return d ? `<path class="detail-neighbor" d="${d}"><title>${esc(f.properties.name)}</title></path>` : '';
    })
    .join('');

  // skipFips: never label the subject state - it already has the slide title.
  const neighbourNames = greyStateLabels(
    path, state.neighborStates, atlas, width, height, state.fips
  );
  const beyond = abroad(path, atlas, width, height);

  // Capital first so it wins the collision pass, then cities, then any
  // point-resolvable landmark.
  const points = [
    { name: state.capital, coords: state.capitalCoords, kind: 'capital' },
    ...(state.majorCities ?? []).map((c) => ({ ...c, kind: 'city' })),
    ...state.majorFeatures
      .filter((f) => f.point && f.coords)
      .map((f) => ({ ...f, kind: 'landmark' })),
  ];

  const placed = project(projection, points, width, height);

  const markerMarkup = placed
    .map((m) => {
      const right = m.x > width * 0.55;
      const tx = right ? m.x - 10 : m.x + 10;
      const cls = m.kind === 'capital' ? 'marker-label is-capital' : 'marker-label';
      return (
        `<g class="marker">` +
        `<line class="marker-leader" x1="${m.x}" y1="${m.y}" x2="${tx}" y2="${m.labelY}" />` +
        glyph(m.kind, m.x, m.y) +
        `<text class="${cls}" x="${tx}" y="${m.labelY}" dy="0.32em" ` +
        `text-anchor="${right ? 'end' : 'start'}">${esc(m.name)}</text>` +
        `</g>`
      );
    })
    .join('');

  return (
    svgOpen(width, height, 'map map-detail') +
    beyond.defs +
    beyond.shapes +
    around +
    `<path class="detail-subject" d="${path(target)}"><title>${esc(state.name)}</title></path>` +
    beyond.labels +
    neighbourNames +
    markerMarkup +
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
  projection.clipExtent([[0, 0], [width, height]]);
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

  const stateLabels = greyStateLabels(path, item.touchedStates, atlas, width, height);
  const beyond = abroad(path, atlas, width, height);

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
  const labelItems = [...partLabelItems(path, item, parts)];

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
    beyond.defs +
    beyond.shapes +
    base +
    (grid ? `<path class="graticule" d="${grid}" />` : '') +
    beyond.labels +
    stateLabels +
    drawn +
    labels +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// The World. Separate from the US maps rather than generalised into them: the
// base layer is countries not states, the context projection covers the globe,
// and the two share nothing but the label and shape conventions.

// Grey names on the countries a feature touches, using the same clipped-centroid
// placement as the state version.
function greyCountryLabels(path, names, world, width, height) {
  return (names ?? [])
    .map((name) => {
      const geo = world.byName.get(name);
      if (!geo) return '';
      if (Math.abs(path.area(geo)) < 900) return '';
      const [cx, cy] = path.centroid(geo);
      if (!Number.isFinite(cx)) return '';
      const half = name.length * 3.3 + 4;
      const lx = Math.min(Math.max(cx, half), width - half);
      return `<text class="state-label" x="${lx.toFixed(1)}" y="${cy.toFixed(
        1
      )}" text-anchor="middle" dy="0.32em">${esc(name)}</text>`;
    })
    .join('');
}

// One label per distinct part name, placed on that name's largest piece, so
// five Great Lakes each get labelled but a river split into three segments
// does not get labelled three times. Shared by all three shape-drawing maps.
function partLabelItems(path, item, parts) {
  if (item.geometry?.labelParts === false || !parts.length) return [];
  const best = new Map();
  for (const part of parts) {
    const [cx, cy] = path.centroid(part.geometry);
    if (!Number.isFinite(cx)) continue;
    const size = Math.abs(path.area(part.geometry)) || path.measure(part.geometry);
    const prev = best.get(part.name);
    if (!prev || size > prev.size) {
      best.set(part.name, { name: displayName(item, part.name), x: cx, y: cy, size, isPart: true });
    }
  }
  return [...best.values()];
}

function featureShapes(path, item, parts) {
  const cls = item.geometry?.kind === 'line' ? 'feat-line' : 'feat-shape';
  return parts
    .map((part) => {
      const d = path(part.geometry);
      return d
        ? `<path class="${cls}" d="${d}"><title>${esc(displayName(item, part.name))}</title></path>`
        : '';
    })
    .join('');
}

// Some world features - the continents, the oceans, the Arctic Circle - span
// most of the planet. There is no meaningful "zoom" for those, and fitting a
// conic projection to the whole globe mirrors and shreds it, so they get a
// single globe view instead of a pair.
export function isGlobalSpan(item) {
  const bbox = boundsOfParts(item.geometryParts ?? [], item.markers) ?? item.focus?.bbox;
  if (!bbox) return false;
  const [[w, s], [e, n]] = bbox;
  return Math.abs(e - w) > 150 || Math.abs(n - s) > 100;
}

// Tier 1 for world features: the whole globe, with the subject drawn on it.
export function worldContextMap(world, item, { width = 820, height = 460, showMarkers = false } = {}) {
  const projection = worldProjection(world.land, width, height);
  const path = pathFor(projection);
  const parts = item.geometryParts ?? [];
  const touched = new Set(parts.length ? [] : item.countriesTouched ?? []);

  const base = world.countries.features
    .map((f) => {
      const d = path(f);
      if (!d) return '';
      const on = touched.has(f.properties.name);
      return `<path class="ctx-state${on ? ' is-active' : ''}" d="${d}"><title>${esc(
        f.properties.name
      )}</title></path>`;
    })
    .join('');

  const grid = path(geoGraticule10());

  // A globe-spanning feature with no shape - the megacities, say - carries its
  // meaning entirely in its markers, so the context map has to draw them.
  // Only when the globe IS the detail map. On a paired layout the markers
  // belong on the zoomed view; at world scale they pile into one corner.
  // Only when the globe IS the only map. On a paired layout these belong on
  // the zoomed view; at world scale they pile into one corner.
  const overlay = !showMarkers
    ? ''
    : spread(
        [...partLabelItems(path, item, parts), ...project(projection, item.markers, width, height)],
        15,
        height
      )
        .map((m) => {
          if (m.isPart) {
            return `<text class="feat-label" x="${m.x.toFixed(1)}" y="${m.labelY.toFixed(
              1
            )}" text-anchor="middle" dy="0.32em">${esc(m.name)}</text>`;
          }
          const right = m.x > width * 0.55;
          const tx = right ? m.x - 8 : m.x + 8;
          return (
            `<g class="marker">` +
            `<line class="marker-leader" x1="${m.x}" y1="${m.y}" x2="${tx}" y2="${m.labelY}" />` +
            `<circle class="marker-dot" cx="${m.x}" cy="${m.y}" r="3" />` +
            `<text class="marker-label" x="${tx}" y="${m.labelY}" dy="0.32em" ` +
            `text-anchor="${right ? 'end' : 'start'}">${esc(m.name)}</text></g>`
          );
        })
        .join('');

  return (
    svgOpen(width, height, 'map map-context map-world') +
    `<path class="ocean-sphere" d="${path({ type: 'Sphere' })}" />` +
    `<path class="graticule" d="${grid}" />` +
    base +
    featureShapes(path, item, parts).replace(/class="feat-/g, 'class="is-ctx feat-') +
    overlay +
    `</svg>`
  );
}

// Tier 2 for world features: zoom to the subject, countries as context.
export function worldDetailMap(world, item, { width = 820, height = 520 } = {}) {
  const parts = item.geometryParts ?? [];
  const bbox = boundsOfParts(parts, item.markers) ?? item.focus?.bbox;
  if (!bbox) return `<p class="map-missing">No detail geometry.</p>`;

  const frame = bboxFeature(bbox);
  const projection = zoomProjection(frame, width, height, 14);
  projection.clipExtent([[0, 0], [width, height]]);
  const path = pathFor(projection);

  const touched = new Set(parts.length ? [] : item.countriesTouched ?? []);
  const base = world.countries.features
    .map((f) => {
      const d = path(f);
      if (!d) return '';
      const on = touched.has(f.properties.name);
      return `<path class="detail-neighbor${on ? ' is-touched' : ''}" d="${d}"><title>${esc(
        f.properties.name
      )}</title></path>`;
    })
    .join('');

  const labels = greyCountryLabels(path, item.countriesTouched, world, width, height);
  const grid = path(graticuleFor(bbox));

  // Shape labels and markers share one collision pass, as on the US maps.
  const items = [...partLabelItems(path, item, parts)];
  const partNames = parts.map((p) => p.name.toLowerCase());
  for (const m of item.markers ?? []) {
    const n = m.name.toLowerCase();
    if (partNames.some((p) => p.includes(n) || n.includes(p))) continue;
    const pt = projection(m.coords);
    if (!pt || !Number.isFinite(pt[0])) continue;
    items.push({ ...m, x: pt[0], y: pt[1] });
  }

  const drawn = spread(items, 20, height)
    .map((l) => {
      const moved = Math.abs(l.labelY - l.y) > 5;
      if (l.isPart) {
        return (
          `<g class="marker">` +
          (moved ? `<line class="marker-leader" x1="${l.x}" y1="${l.y}" x2="${l.x}" y2="${l.labelY}" />` : '') +
          `<text class="feat-label" x="${l.x.toFixed(1)}" y="${l.labelY.toFixed(
            1
          )}" text-anchor="middle" dy="0.32em">${esc(l.name)}</text></g>`
        );
      }
      const right = l.x > width * 0.55;
      const tx = right ? l.x - 10 : l.x + 10;
      return (
        `<g class="marker">` +
        `<line class="marker-leader" x1="${l.x}" y1="${l.y}" x2="${tx}" y2="${l.labelY}" />` +
        `<circle class="marker-dot" cx="${l.x}" cy="${l.y}" r="3.4" />` +
        `<text class="marker-label" x="${tx}" y="${l.labelY}" dy="0.32em" ` +
        `text-anchor="${right ? 'end' : 'start'}">${esc(l.name)}</text></g>`
      );
    })
    .join('');

  return (
    svgOpen(width, height, 'map map-detail map-world') +
    base +
    (grid ? `<path class="graticule" d="${grid}" />` : '') +
    labels +
    featureShapes(path, item, parts) +
    drawn +
    `</svg>`
  );
}
