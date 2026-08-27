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
const sections = JSON.parse(readFileSync(join(root, 'src/data/sections.json'), 'utf8'));
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
  // Cities are drawn as points on the state's own map, so a wrong coordinate
  // puts a labelled dot in the wrong state - or the ocean.
  for (const city of d.majorCities ?? []) {
    if (!city.name || !city.coords) {
      fail(file, `majorCities entry missing name or coords`);
      continue;
    }
    if (!geoContains(geo, city.coords)) {
      // us-atlas coastlines are generalised, so a genuine coastal town can sit
      // just outside the polygon. Only treat it as an error if it is well
      // clear of the state's own extent - that means the wrong state entirely.
      const [[bw, bs], [be, bn]] = geoBounds(geo);
      const pad = 0.25;
      const nearby =
        city.coords[0] >= bw - pad && city.coords[0] <= be + pad &&
        city.coords[1] >= bs - pad && city.coords[1] <= bn + pad;
      if (nearby) warn(file, `city "${city.name}" sits just outside the generalised coastline`);
      else fail(file, `city "${city.name}" ${city.coords} is not in ${d.name}`);
    }
  }
  if ((d.majorCities ?? []).length < 2) warn(file, `only ${(d.majorCities ?? []).length} majorCities (aim for 2-5)`);
  if ((d.majorCities ?? []).some((c) => c.name === d.capital)) {
    fail(file, `majorCities repeats the capital "${d.capital}" - the star already marks it`);
  }

  // A landmark marked `point` gets a square on the map, so it must actually be
  // one place. Ranges, rivers and regions must not be flagged.
  for (const feat of d.majorFeatures) {
    if (!feat.point) continue;
    if (!feat.coords) { fail(file, `"${feat.name}" is marked point but has no coords`); continue; }
    if (!geoContains(geo, feat.coords)) {
      warn(file, `point landmark "${feat.name}" falls outside ${d.name}`);
    }
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
const shapes = JSON.parse(readFileSync(join(root, 'src/data/geometry/shapes.json'), 'utf8'));

// Every category declared in a live section must resolve to real slides, and
// every feature must name a category that exists.
const featureCategories = new Set();
for (const section of sections) {
  for (const cat of section.categories ?? []) {
    if (cat.kind === 'features') featureCategories.add(cat.id);
    for (const k of ['id', 'title', 'kind', 'blurb']) {
      if (cat[k] === undefined) fail('sections.json', `category "${cat.id}" missing "${k}"`);
    }
  }
}

features.forEach((f, i) => {
  if (!featureCategories.has(f.category)) {
    fail(`features.json[${i}]`, `category "${f.category}" is not declared in sections.json`);
  }
  for (const k of ['id', 'name', 'category', 'story', 'statesTouched', 'keyFacts', 'focus']) {
    if (f[k] === undefined) fail(`features.json[${i}]`, `missing "${k}"`);
  }
  // d3-geo reads a wrongly wound ring as "the whole globe minus this box",
  // which silently zooms the detail map out to the entire planet.
  if (f.focus?.bbox && geoArea(bboxFeature(f.focus.bbox)) > 1) {
    fail(`features.json[${i}]`, `focus.bbox covers most of the globe - check ring winding`);
  }
  // shapes.json is generated by `npm run build:geometry`. If a feature starts
  // referencing Natural Earth and nobody re-runs that, the map silently loses
  // its subject - which is exactly how the Sonoran Desert went missing once.
  if (f.geometry?.source === 'natural-earth' && !shapes[f.id]) {
    fail(`features.json[${i}]`, `"${f.id}" references Natural Earth but is absent from geometry/shapes.json - run: npm run build:geometry`);
  }
  if (f.geometry && !shapes[f.id] && !f.geometry.inlineParts?.length) {
    fail(`features.json[${i}]`, `"${f.id}" declares geometry but resolves to no parts`);
  }
  for (const abbr of f.statesTouched ?? []) {
    if (abbr !== 'DC' && !byAbbr.has(abbr)) fail(`features.json[${i}]`, `unknown state "${abbr}"`);
  }
});

// An empty tile on the landing page reads as broken, so treat it as an error.
for (const section of sections.filter((s) => s.status !== 'planned')) {
  for (const cat of section.categories ?? []) {
    const n = cat.kind === 'states' ? states.length : features.filter((f) => f.category === cat.id).length;
    if (n === 0) fail('sections.json', `live category "${cat.id}" has no slides`);
  }
}

const counts = sections
  .filter((s) => s.status !== 'planned')
  .flatMap((s) => s.categories)
  .map((c) => `${c.id}=${c.kind === 'states' ? states.length : features.filter((f) => f.category === c.id).length}`)
  .join(' ');
console.log(`checked ${states.length} states + ${features.length} features`);
console.log(`categories: ${counts}`);
if (warnings.length) console.log('\nWARNINGS:\n' + warnings.map((w) => '  ' + w).join('\n'));
if (errors.length) {
  console.error('\nERRORS:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(errors.length ? '' : '\nAll data valid.');
