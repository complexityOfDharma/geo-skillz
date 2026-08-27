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

// Citation coverage ratchets: every slide that HAS sources must have valid
// ones, and once a section is fully cited its entry here flips to true so no
// later slide can ship uncited. See CLAUDE.md.
const REQUIRE_SOURCES = { states: false, features: false };

const errors = [];
const warnings = [];
const fail = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

const REQUIRED = [
  'name', 'abbreviation', 'fips', 'capital', 'capitalCoords', 'region',
  'statehoodOrder', 'statehoodYear', 'nameStory', 'capitalStory',
  'neighboringStates', 'majorFeatures', 'funFacts',
];

// Shared by states and features: a slide's sources must be well formed, and
// every source a fact points at must exist.
function checkSources(label, d, factLists, requireSome) {
  const sources = d.sources ?? [];
  const ids = new Set();
  for (const src of sources) {
    for (const k of ['id', 'title', 'publisher', 'url']) {
      if (!src[k]) fail(label, `source ${src.id ?? '?'} missing "${k}"`);
    }
    if (src.id && ids.has(src.id)) fail(label, `duplicate source id "${src.id}"`);
    if (src.id) ids.add(src.id);
    try {
      const u = new URL(src.url);
      if (u.protocol !== 'https:') fail(label, `source "${src.id}" is not https`);
    } catch {
      fail(label, `source "${src.id}" has an unparseable url`);
    }
  }
  let cited = 0;
  for (const facts of factLists) {
    for (const f of facts ?? []) {
      const ref = typeof f === 'string' ? null : f.source;
      if (!ref) continue;
      cited++;
      if (!ids.has(ref)) fail(label, `fact cites unknown source "${ref}"`);
    }
  }
  if (d.whyItMattersSource && !ids.has(d.whyItMattersSource)) {
    fail(label, `whyItMatters cites unknown source "${d.whyItMattersSource}"`);
  }
  if (!sources.length) {
    (requireSome ? fail : warn)(label, 'no sources - see CLAUDE.md on citing verifiable claims');
  } else if (cited === 0) {
    warn(label, 'has sources but no fact points at one');
  }
  return sources.length;
}

const states = readdirSync(statesDir).filter((f) => f.endsWith('.json'));
const byAbbr = new Map();
let citedStates = 0;
let citedFeatures = 0;

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
  citedStates += checkSources(file, d, [d.funFacts], REQUIRE_SOURCES.states) ? 1 : 0;
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

const usFeatures = JSON.parse(readFileSync(join(root, 'src/data/features.json'), 'utf8'));
const worldFeatures = JSON.parse(readFileSync(join(root, 'src/data/world-features.json'), 'utf8'));
// Category ids repeat across sections ("water" exists in both), so counts and
// lookups have to be scoped the same way the app scopes them.
const featuresBySection = { us: usFeatures, world: worldFeatures };
const features = [...usFeatures, ...worldFeatures];
const shapes = {
  ...JSON.parse(readFileSync(join(root, 'src/data/geometry/shapes.json'), 'utf8')),
  ...JSON.parse(readFileSync(join(root, 'src/data/geometry/world-shapes.json'), 'utf8')),
};
// Country names in world features must match world-atlas exactly, or the map
// silently highlights nothing.
const worldTopo = JSON.parse(readFileSync(join(root, 'node_modules/world-atlas/countries-50m.json')));
const worldNames = new Set(worldTopo.objects.countries.geometries.map((g) => g.properties.name));

// Every category declared in a live section must resolve to real slides, and
// every feature must name a category that exists.
const featureCategories = {};
for (const section of sections) {
  featureCategories[section.id] = new Set();
  for (const cat of section.categories ?? []) {
    if (cat.kind === 'features') featureCategories[section.id].add(cat.id);
    for (const k of ['id', 'title', 'kind', 'blurb']) {
      if (cat[k] === undefined) fail('sections.json', `category "${cat.id}" missing "${k}"`);
    }
  }
}

for (const [sectionId, list] of Object.entries(featuresBySection)) {
  list.forEach((f, i) => {
    if (!featureCategories[sectionId]?.has(f.category)) {
      fail(`${sectionId} features[${i}]`, `category "${f.category}" is not declared for section "${sectionId}"`);
    }
  });
}

features.forEach((f, i) => {
  const isWorld = worldFeatures.includes(f);
  const required = isWorld
    ? ['id', 'name', 'category', 'story', 'countriesTouched', 'keyFacts']
    : ['id', 'name', 'category', 'story', 'statesTouched', 'keyFacts', 'focus'];
  for (const k of required) {
    if (f[k] === undefined) fail(`features[${i}]`, `"${f.id}" missing "${k}"`);
  }
  // Without geometry there is nothing to frame a detail map on, so a bbox is
  // then mandatory.
  if (isWorld && !f.geometry && !f.focus) {
    fail(`features[${i}]`, `"${f.id}" has neither geometry nor focus.bbox to frame a map`);
  }
  for (const c of f.countriesTouched ?? []) {
    if (!worldNames.has(c)) fail(`features[${i}]`, `"${f.id}" names unknown country "${c}"`);
  }
  // d3-geo reads a wrongly wound ring as "the whole globe minus this box",
  // which silently zooms the detail map out to the entire planet.
  if (f.focus?.bbox) {
    const [[w, s2], [e, n]] = f.focus.bbox;
    const dLon = Math.abs(e - w) > 360 ? 360 : Math.abs(e - w);
    const rad = Math.PI / 180;
    // Area the box should cover if wound correctly. A backwards ring gives the
    // complement instead, so compare against both and see which it matches.
    const expected = (dLon / 360) * ((Math.sin(n * rad) - Math.sin(s2 * rad)) / 2) * 4 * Math.PI;
    const actual = geoArea(bboxFeature(f.focus.bbox));
    if (Math.abs(actual - (4 * Math.PI - expected)) < Math.abs(actual - expected)) {
      fail(`features[${i}]`, `"${f.id}" focus.bbox is wound backwards - it describes the rest of the globe`);
    }
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
  citedFeatures += checkSources(`${f.id}`, f, [f.keyFacts], REQUIRE_SOURCES.features) ? 1 : 0;
  for (const abbr of f.statesTouched ?? []) {
    if (abbr !== 'DC' && !byAbbr.has(abbr)) fail(`features.json[${i}]`, `unknown state "${abbr}"`);
  }
});

// An empty tile on the landing page reads as broken, so treat it as an error.
for (const section of sections.filter((s) => s.status !== 'planned')) {
  for (const cat of section.categories ?? []) {
    const n =
      cat.kind === 'states'
        ? states.length
        : (featuresBySection[section.id] ?? []).filter((f) => f.category === cat.id).length;
    if (n === 0) fail('sections.json', `live category "${cat.id}" has no slides`);
  }
}

const counts = sections
  .filter((s) => s.status !== 'planned')
  .flatMap((s) => (s.categories ?? []).map((c) => ({ ...c, sectionId: s.id })))
  .map((c) => {
    const n =
      c.kind === 'states'
        ? states.length
        : (featuresBySection[c.sectionId] ?? []).filter((f) => f.category === c.id).length;
    return `${c.sectionId}/${c.id}=${n}`;
  })
  .join(' ');
console.log(`checked ${states.length} states + ${features.length} features`);
console.log(
  `cited: ${citedStates}/${states.length} states, ${citedFeatures}/${features.length} features`
);
console.log(`categories: ${counts}`);
if (warnings.length) console.log('\nWARNINGS:\n' + warnings.map((w) => '  ' + w).join('\n'));
if (errors.length) {
  console.error('\nERRORS:\n' + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
console.log(errors.length ? '' : '\nAll data valid.');
