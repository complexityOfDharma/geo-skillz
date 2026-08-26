// Validates every data file against the schema the renderer assumes.
// Run with `npm run check:data`. Adding Phase 2 files? This is what tells you
// whether they will render before you open a browser.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { bboxFeature } from '../src/lib/geo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const statesDir = join(root, 'src/data/states');
const topo = JSON.parse(readFileSync(join(root, 'node_modules/us-atlas/states-10m.json')));
const geoByFips = new Map(
  topojson.feature(topo, topo.objects.states).features.map((f) => [f.id, f])
);

const errors = [];
const warnings = [];
const fail = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

const REQUIRED = [
  'name', 'abbreviation', 'fips', 'capital', 'capitalCoords', 'region',
  'statehoodOrder', 'statehoodYear', 'nameStory', 'capitalStory',
  'neighboringStates', 'majorFeatures', 'funFacts',
];

const states = readdirSync(statesDir).filter((f) => f.endsWith('.json'));
const byAbbr = new Map();

for (const file of states) {
  const d = JSON.parse(readFileSync(join(statesDir, file), 'utf8'));
  for (const k of REQUIRED) {
    if (d[k] === undefined) fail(file, `missing required field "${k}"`);
  }
  if (byAbbr.has(d.abbreviation)) fail(file, `duplicate abbreviation ${d.abbreviation}`);
  byAbbr.set(d.abbreviation, d);

  const geo = geoByFips.get(d.fips);
  if (!geo) {
    fail(file, `fips "${d.fips}" has no matching geometry in us-atlas`);
    continue;
  }
  if (geo.properties.name !== d.name) {
    fail(file, `fips ${d.fips} is "${geo.properties.name}" in us-atlas, not "${d.name}"`);
  }
  // The capital marker is drawn at these coordinates; if it is outside the
  // state the slide silently renders a dot in the ocean.
  if (!geoContains(geo, d.capitalCoords)) {
    warn(file, `capitalCoords ${d.capitalCoords} fall outside the state polygon`);
  }
  const [[w, s], [e, n]] = geoBounds(geo);
  for (const feat of d.majorFeatures) {
    if (!feat.coords) continue;
    const [lon, lat] = feat.coords;
    const lonOk = w <= e ? lon >= w - 1.5 && lon <= e + 1.5 : lon >= w - 1.5 || lon <= e + 1.5;
    if (!lonOk || lat < s - 1.5 || lat > n + 1.5) {
      warn(file, `feature "${feat.name}" coords are far outside the state's bounds`);
    }
  }
  if (d.funFacts.length < 3) warn(file, `only ${d.funFacts.length} funFacts (aim for 3-5)`);
}

// Neighbor lists should agree with each other. DC is a valid neighbor but has
// no state file of its own.
for (const [abbr, d] of byAbbr) {
  for (const nb of d.neighboringStates) {
    if (nb === 'DC') continue;
    const other = byAbbr.get(nb);
    if (!other) { fail(`${abbr}`, `lists unknown neighbor "${nb}"`); continue; }
    if (!other.neighboringStates.includes(abbr)) {
      fail(`${abbr}`, `lists ${nb} as a neighbor, but ${nb} does not list ${abbr}`);
    }
  }
}

const features = JSON.parse(readFileSync(join(root, 'src/data/features.json'), 'utf8'));
features.forEach((f, i) => {
  for (const k of ['id', 'name', 'story', 'statesTouched', 'keyFacts', 'focus']) {
    if (f[k] === undefined) fail(`features.json[${i}]`, `missing "${k}"`);
  }
  // d3-geo reads a wrongly wound ring as "the whole globe minus this box",
  // which silently zooms the detail map out to the entire planet.
  if (f.focus?.bbox && geoArea(bboxFeature(f.focus.bbox)) > 1) {
    fail(`features.json[${i}]`, `focus.bbox covers most of the globe - check ring winding`);
  }
  for (const abbr of f.statesTouched ?? []) {
    if (abbr !== 'DC' && !byAbbr.has(abbr)) fail(`features.json[${i}]`, `unknown state "${abbr}"`);
  }
});

console.log(`checked ${states.length} states + ${features.length} features`);
if (warnings.length) console.log('\nWARNINGS:\n' + warnings.map((w) => '  ' + w).join('\n'));
if (errors.length) {
  console.error('\nERRORS:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(errors.length ? '' : '\nAll data valid.');
