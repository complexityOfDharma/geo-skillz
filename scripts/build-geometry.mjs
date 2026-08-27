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
};

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

function simplifyRing(ring, tolerance, closed) {
  // A ring needs 4 points to still be a polygon after simplification.
  const out = round(douglasPeucker(ring, tolerance));
  if (closed && out.length >= 3) {
    const [fx, fy] = out[0];
    const [lx, ly] = out[out.length - 1];
    if (fx !== lx || fy !== ly) out.push([fx, fy]);
  }
  return out;
}

function simplifyGeometry(geom, tolerance) {
  const { type, coordinates } = geom;
  if (type === 'Polygon') {
    const rings = coordinates.map((r) => simplifyRing(r, tolerance, true)).filter((r) => r.length >= 4);
    return rings.length ? { type, coordinates: rings } : null;
  }
  if (type === 'MultiPolygon') {
    const polys = coordinates
      .map((poly) => poly.map((r) => simplifyRing(r, tolerance, true)).filter((r) => r.length >= 4))
      .filter((poly) => poly.length);
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
      if (g?.source === 'natural-earth') refs.push({ id: item.id, ...g });
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
    for (const hit of hits) {
      const geom = simplifyGeometry(hit.geometry, tolerance);
      if (geom) parts.push({ name: wanted, geometry: geom });
    }
  }

  if (parts.length) shapes[ref.id] = { kind: ref.kind, parts };
}

if (errors.length) {
  console.error('\nERRORS:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}

const outDir = join(root, 'src/data/geometry');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'shapes.json');
writeFileSync(outPath, JSON.stringify(shapes) + '\n');

const kb = (readFileSync(outPath).length / 1024).toFixed(0);
console.log(`\nwrote ${Object.keys(shapes).length} shapes (${refs.reduce((n, r) => n + r.names.length, 0)} parts) -> ${kb} KB`);
for (const [id, s] of Object.entries(shapes)) {
  console.log(`  ${id.padEnd(28)} ${s.kind.padEnd(8)} ${s.parts.length} part(s)`);
}
