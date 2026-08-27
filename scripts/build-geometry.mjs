// Subsets Natural Earth into the handful of shapes this deck actually draws.
//
//   npm run build:geometry
//
// Natural Earth is public domain (naturalearthdata.com), same lineage as the
// us-atlas already used for state boundaries. The full layers are 5-18 MB each,
// so this downloads them once into a gitignored .cache/, pulls out only the
// named features, simplifies them, and writes src/data/geometry/shapes.json.
//
// That output IS committed, so `npm run build` and CI never touch the network.
// Re-run this only when a data file starts referencing a new shape.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { geoCentroid } from 'd3-geo';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache');
const MIRROR = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

// Short names used in the data files -> Natural Earth layer files.
const LAYERS = {
  lakes: 'ne_10m_lakes',
  regions: 'ne_10m_geography_regions_polys',
  marine: 'ne_10m_geography_marine_polys',
  rivers: 'ne_10m_rivers_lake_centerlines',
  lines: 'ne_10m_geographic_lines',
  countries: 'ne_50m_admin_0_countries',
};

// Drawn as context on every US close-up map. The national context map uses
// AlbersUsa, which relocates Alaska and Hawaii into insets, so neighbouring
// countries cannot be drawn truthfully there and deliberately are not.
const CONTEXT_COUNTRIES = ['Canada', 'Mexico'];

const neName = (f) => f.properties.NAME ?? f.properties.name ?? '';
const norm = (s) => String(s).trim().toLowerCase();

async function layer(key) {
  const file = LAYERS[key];
  if (!file) throw new Error(`unknown layer "${key}" (expected one of ${Object.keys(LAYERS)})`);
  mkdirSync(cache, { recursive: true });
  const path = join(cache, `${file}.geojson`);
  if (!existsSync(path)) {
    process.stdout.write(`  downloading ${file}… `);
    const res = await fetch(`${MIRROR}/${file}.geojson`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log('done');
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// --- simplification -------------------------------------------------------
// Douglas-Peucker, then coordinate rounding. At the zooms these maps use,
// 3 decimal places is about 110 m - far finer than a 2px stroke can show.

const perpDist = ([px, py], [x1, y1], [x2, y2]) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  return [
    ...douglasPeucker(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...douglasPeucker(points.slice(index), tolerance),
  ];
}

const round = (ring) => ring.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);

// Simplification happily collapses a long straight border into two distant
// endpoints. That is fine on a plane, but d3-geo draws each segment as a great
// circle, and a great circle between two points at the same latitude bows
// toward the pole - the US/Canada prairie border became a single 27.6-degree
// segment that bowed ~100 km north, leaving a visible wedge of gap above the
// states. Re-inserting intermediate points keeps long edges where they belong.
function densify(ring, maxSeg = 0.25) {
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    out.push(ring[i]);
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / maxSeg);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      out.push([+(x1 + (x2 - x1) * t).toFixed(3), +(y1 + (y2 - y1) * t).toFixed(3)]);
    }
  }
  if (ring.length) out.push(ring[ring.length - 1]);
  return out;
}

function simplifyRing(ring, tolerance, closed) {
  // Densify in proportion to how coarse the shape already is. A quarter-degree
  // step is right for a state border, but re-inserting points that finely into
  // a continent outline simplified at 0.6 degrees just undoes the saving.
  const maxSeg = Math.min(Math.max(tolerance * 4, 0.25), 2);
  // A ring needs 4 points to still be a polygon after simplification.
  const out = densify(round(douglasPeucker(ring, tolerance)), maxSeg);
  if (closed && out.length >= 3) {
    const [fx, fy] = out[0];
    const [lx, ly] = out[out.length - 1];
    if (fx !== lx || fy !== ly) out.push([fx, fy]);
  }
  return out;
}

// Rough planar area of a ring in square degrees - only used to decide whether
// a polygon is too small to be worth keeping at the scale it will be drawn.
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function simplifyGeometry(geom, tolerance, minArea = 0) {
  const { type, coordinates } = geom;
  if (type === 'Polygon') {
    const rings = coordinates.map((r) => simplifyRing(r, tolerance, true)).filter((r) => r.length >= 4);
    return rings.length ? { type, coordinates: rings } : null;
  }
  if (type === 'MultiPolygon') {
    const polys = coordinates
      .map((poly) => poly.map((r) => simplifyRing(r, tolerance, true)).filter((r) => r.length >= 4))
      // A continent carries thousands of islands that are far below one pixel
      // at world scale; keeping them costs hundreds of KB and shows nothing.
      .filter((poly) => poly.length && ringArea(poly[0]) >= minArea);
    return polys.length ? { type, coordinates: polys } : null;
  }
  if (type === 'LineString') {
    const line = simplifyRing(coordinates, tolerance, false);
    return line.length >= 2 ? { type, coordinates: line } : null;
  }
  if (type === 'MultiLineString') {
    const lines = coordinates.map((l) => simplifyRing(l, tolerance, false)).filter((l) => l.length >= 2);
    return lines.length ? { type, coordinates: lines } : null;
  }
  return geom;
}

// --- collect references ---------------------------------------------------

function collectRefs() {
  const refs = [];
  const files = ['src/data/features.json', 'src/data/world-features.json'];
  for (const rel of files) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    for (const item of JSON.parse(readFileSync(path, 'utf8'))) {
      const g = item.geometry;
      if (g?.source === 'natural-earth') {
        refs.push({ id: item.id, section: rel.includes('world') ? 'world' : 'us', ...g });
      }
    }
  }
  return refs;
}

// --- main -----------------------------------------------------------------

const refs = collectRefs();
console.log(`resolving ${refs.length} Natural Earth references`);

const shapes = {};
const errors = [];
const layerCache = new Map();

for (const ref of refs) {
  if (!layerCache.has(ref.layer)) layerCache.set(ref.layer, await layer(ref.layer));
  const fc = layerCache.get(ref.layer);

  const tolerance = ref.tolerance ?? 0.02;
  const parts = [];

  for (const wanted of ref.names) {
    const hits = fc.features.filter((f) => norm(neName(f)) === norm(wanted));
    if (!hits.length) {
      // Fail loudly rather than silently rendering a blank map.
      const near = fc.features
        .map(neName)
        .filter((n) => n && norm(n).includes(norm(wanted).split(' ')[0]))
        .slice(0, 5);
      errors.push(
        `${ref.id}: "${wanted}" not found in layer "${ref.layer}"` +
          (near.length ? ` (near: ${near.join(', ')})` : '')
      );
      continue;
    }
    // Place names repeat across the globe - Natural Earth has three rivers
    // called "Colorado", one of them in Argentina. `within` keeps only the
    // matches inside the region this feature is actually about.
    const inRegion = (f) => {
      if (!ref.within) return true;
      const [[w, s], [e, n]] = ref.within;
      const [lon, lat] = geoCentroid(f);
      return lon >= w && lon <= e && lat >= s && lat <= n;
    };

    const kept = hits.filter(inRegion);
    if (!kept.length) {
      errors.push(`${ref.id}: "${wanted}" matched ${hits.length} feature(s) but none inside "within"`);
      continue;
    }
    for (const hit of kept) {
      const geom = simplifyGeometry(hit.geometry, tolerance, ref.minArea ?? 0);
      if (geom) parts.push({ name: wanted, geometry: geom });
    }
  }

  if (parts.length) shapes[ref.id] = { kind: ref.kind, section: ref.section, parts };
}

if (errors.length) {
  console.error('\nERRORS:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}

const outDir = join(root, 'src/data/geometry');
mkdirSync(outDir, { recursive: true });
// Two files: US shapes ship in the main bundle, world shapes load lazily
// alongside the country geometry, so the US section never pays for them.
const split = { us: {}, world: {} };
for (const [id, shape] of Object.entries(shapes)) {
  const { section, ...rest } = shape;
  split[section ?? 'us'][id] = rest;
}
const outPath = join(outDir, 'shapes.json');
writeFileSync(outPath, JSON.stringify(split.us) + '\n');
const worldPath = join(outDir, 'world-shapes.json');
writeFileSync(worldPath, JSON.stringify(split.world) + '\n');

const kb = (readFileSync(outPath).length / 1024).toFixed(0);
console.log(`\nwrote ${Object.keys(shapes).length} shapes (${refs.reduce((n, r) => n + r.names.length, 0)} parts) -> ${kb} KB`);
for (const [id, s] of Object.entries(shapes)) {
  console.log(`  ${id.padEnd(28)} ${s.kind.padEnd(8)} ${s.parts.length} part(s)`);
}

// Neighbouring-country outlines, generalised hard - they are background context
// on every US close-up map, never the subject.
const countries = await layer('countries');
const context = {};
for (const name of CONTEXT_COUNTRIES) {
  const hit = countries.features.find((f) => norm(f.properties.NAME) === norm(name));
  if (!hit) {
    console.error(`context: country "${name}" not found in ${LAYERS.countries}`);
    process.exit(1);
  }
  const geom = simplifyGeometry(hit.geometry, 0.08);
  if (geom) context[name] = geom;
}
const ctxPath = join(outDir, 'context.json');
writeFileSync(ctxPath, JSON.stringify(context) + '\n');
console.log(
  `context: ${Object.keys(context).join(', ')} -> ${(readFileSync(ctxPath).length / 1024).toFixed(0)} KB`
);
