// Renders every slide in Node to catch broken geometry, NaN coordinates and
// throwing templates without needing a browser.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { renderSlide } from '../src/ui/slides.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const topo = JSON.parse(readFileSync(join(root, 'node_modules/us-atlas/states-10m.json')));
const stateFC = topojson.feature(topo, topo.objects.states);
const atlas = {
  states: stateFC,
  nation: topojson.feature(topo, topo.objects.nation),
  byFips: new Map(stateFC.features.map((f) => [f.id, f])),
};

const dir = join(root, 'src/data/states');
const states = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => a.name.localeCompare(b.name));
const byAbbr = new Map(states.map((s) => [s.abbreviation, s]));
const features = JSON.parse(readFileSync(join(root, 'src/data/features.json'), 'utf8'));

const deck = [
  { kind: 'overview', id: 'overview', title: 'The United States' },
  ...states.map((d) => ({ kind: 'state', id: d.abbreviation, title: d.name, data: d })),
  ...features.map((d) => ({
    kind: 'feature',
    id: d.id,
    title: d.name,
    data: { ...d, fipsTouched: (d.statesTouched ?? []).map((a) => byAbbr.get(a)?.fips).filter(Boolean) },
  })),
];

let bad = 0;
for (const slide of deck) {
  let html;
  try {
    html = renderSlide(slide, atlas, deck);
  } catch (err) {
    console.error(`THREW  ${slide.title}: ${err.message}`);
    bad++;
    continue;
  }
  const problems = [];
  if (/NaN|Infinity/.test(html)) problems.push('NaN/Infinity in output');
  if (!/<svg/.test(html)) problems.push('no svg rendered');
  const paths = (html.match(/ d="/g) ?? []).length;
  if (paths < 40) problems.push(`only ${paths} map paths`);
  const markers = (html.match(/marker-dot/g) ?? []).length;
  if (slide.kind !== 'overview' && markers === 0) problems.push('no markers placed');
  if (problems.length) {
    console.error(`BAD    ${slide.title}: ${problems.join('; ')}`);
    bad++;
  }
}
console.log(`rendered ${deck.length} slides, ${bad} with problems`);
process.exit(bad ? 1 : 0);
