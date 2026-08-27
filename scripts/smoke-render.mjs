// Renders every page in Node to catch broken geometry, NaN coordinates and
// throwing templates without needing a browser.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { buildSections } from '../src/data/build-tree.js';
import { renderSlide, breadcrumbFor } from '../src/ui/slides.js';
import { renderLanding } from '../src/ui/landing.js';
import { renderCategory } from '../src/ui/category.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const topo = read('node_modules/us-atlas/states-10m.json');
const stateFC = topojson.feature(topo, topo.objects.states);
const atlas = {
  states: stateFC,
  nation: topojson.feature(topo, topo.objects.nation),
  byFips: new Map(stateFC.features.map((f) => [f.id, f])),
  context: read('src/data/geometry/context.json'),
};

// The browser loads this lazily; the Node check always has it.
const worldTopo = read('node_modules/world-atlas/countries-50m.json');
const worldCountries = topojson.feature(worldTopo, worldTopo.objects.countries);
atlas.world = {
  countries: worldCountries,
  land: topojson.feature(worldTopo, worldTopo.objects.land),
  byName: new Map(worldCountries.features.map((f) => [f.properties.name, f])),
};

const dir = join(root, 'src/data/states');
const states = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => a.name.localeCompare(b.name));

const sections = buildSections(
  read('src/data/sections.json'),
  states,
  [
    ...read('src/data/features.json').map((f) => ({ ...f, section: 'us' })),
    ...read('src/data/world-features.json').map((f) => ({ ...f, section: 'world' })),
  ],
  { ...read('src/data/geometry/shapes.json'), ...read('src/data/geometry/world-shapes.json') }
);
const crumb = breadcrumbFor([{ label: 'Home', href: '#/' }, { label: 'Test' }]);

let bad = 0;
const problem = (label, msgs) => {
  console.error(`BAD    ${label}: ${msgs.join('; ')}`);
  bad++;
};
const scan = (html) => {
  const out = [];
  if (/NaN|Infinity/.test(html)) out.push('NaN/Infinity in output');
  // An entity written inside a string that then went through esc() comes out as
  // "&amp;mdash;" and renders to the reader as literal "&mdash;".
  const doubled = html.match(/&amp;[a-z]+;/g);
  if (doubled) out.push(`double-escaped entity: ${doubled[0]}`);
  return out;
};

// Landing page.
{
  const html = renderLanding(sections);
  const msgs = scan(html);
  // One tile per live category across every section.
  const expected = sections
    .filter((s) => s.status !== 'planned')
    .reduce((n, s) => n + s.categories.length, 0);
  const tiles = (html.match(/class="tile[ "]/g) ?? []).length;
  if (tiles !== expected) msgs.push(`${tiles} tiles, expected ${expected}`);
  if (msgs.length) problem('landing', msgs);
}

let pages = 1;
for (const section of sections.filter((s) => s.status !== 'planned')) {
  for (const category of section.categories) {
    pages++;
    const html = renderCategory(category, atlas, crumb);
    const msgs = scan(html);
    if (category.count === 0) msgs.push('category has no slides');
    if ((html.match(/class="card"/g) ?? []).length !== category.count) msgs.push('card count mismatch');
    if (category.kind === 'states' && !/map-context/.test(html)) msgs.push('states index lost its map');
    if (msgs.length) problem(`category ${category.id}`, msgs);

    for (const slide of category.slides) {
      pages++;
      let slideHtml;
      try {
        slideHtml = renderSlide(slide, atlas, crumb);
      } catch (err) {
        problem(slide.title, [`threw: ${err.message}`]);
        continue;
      }
      const m = scan(slideHtml);
      if (!/<svg/.test(slideHtml)) m.push('no svg rendered');
      const paths = (slideHtml.match(/ d="/g) ?? []).length;
      if (paths < 40) m.push(`only ${paths} map paths`);
      // State close-ups use a star/dot/square glyph set; feature slides use
      // point markers or a drawn shape.
      if (slide.kind === 'state') {
        if (!/glyph-capital/.test(slideHtml)) m.push('no capital star');
        if (!/glyph-city/.test(slideHtml)) m.push('no city dots');
      } else if (!/marker-dot|feat-shape|feat-line/.test(slideHtml)) {
        m.push('no markers or shape placed');
      }
      if (!/breadcrumb/.test(slideHtml)) m.push('no breadcrumb');
      if (m.length) problem(slide.title, m);
    }
  }
}

console.log(`rendered ${pages} pages, ${bad} with problems`);
process.exit(bad ? 1 : 0);
