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
};

const dir = join(root, 'src/data/states');
const states = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  .sort((a, b) => a.name.localeCompare(b.name));

const sections = buildSections(read('src/data/sections.json'), states, read('src/data/features.json'));
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
  const tiles = (html.match(/class="tile[ "]/g) ?? []).length;
  if (tiles !== 8) msgs.push(`${tiles} tiles, expected 8 (7 categories + planned World)`);
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
      if (!/marker-dot/.test(slideHtml)) m.push('no markers placed');
      if (!/breadcrumb/.test(slideHtml)) m.push('no breadcrumb');
      if (m.length) problem(slide.title, m);
    }
  }
}

console.log(`rendered ${pages} pages, ${bad} with problems`);
process.exit(bad ? 1 : 0);
