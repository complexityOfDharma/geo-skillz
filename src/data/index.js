// Builds the Section -> Category -> Slide tree that the whole app navigates.
//
// Adding a state (or any new place file) means dropping a JSON file into the
// folder below - the glob picks it up at build time and no code here changes.
// Adding a CATEGORY means editing sections.json and tagging features with its
// id. Adding a whole SECTION (Phase 2: world geography) means a sections.json
// entry plus one more glob here for its place files.
import { buildSections, slug } from './build-tree.js';
import sectionData from './sections.json';
import featureData from './features.json';

const stateModules = import.meta.glob('./states/*.json', { eager: true, import: 'default' });

export const states = Object.values(stateModules).sort((a, b) => a.name.localeCompare(b.name));
export const features = featureData;
export const stateByAbbr = new Map(states.map((s) => [s.abbreviation, s]));

export { slug };

// Section -> Category -> Slide, with back-pointers so any slide knows where it
// lives without the caller threading context through.
export const sections = buildSections(sectionData, states, features);

export const liveSections = sections.filter((s) => s.status !== 'planned');

// Flat lookups the router and search need.
export const allCategories = liveSections.flatMap((s) => s.categories);
export const allSlides = allCategories.flatMap((c) => c.slides);

const categoryKey = (sectionId, categoryId) => `${sectionId}/${categoryId}`;
const categoryIndex = new Map(
  allCategories.map((c) => [categoryKey(c.sectionId, c.id), c])
);
const slideIndex = new Map(
  allSlides.map((s) => [`${categoryKey(s.sectionId, s.categoryId)}/${s.id}`, s])
);
// Legacy flat routes (#/virginia) and the overview map's FIPS clicks.
const slideById = new Map(allSlides.map((s) => [s.id, s]));
const slideByFips = new Map(
  allSlides.filter((s) => s.kind === 'state').map((s) => [s.data.fips, s])
);

export const getSection = (id) => sections.find((s) => s.id === id) ?? null;
export const getCategory = (sectionId, categoryId) =>
  categoryIndex.get(categoryKey(sectionId, categoryId)) ?? null;
export const getSlide = (sectionId, categoryId, slideId) =>
  slideIndex.get(`${categoryKey(sectionId, categoryId)}/${slideId}`) ?? null;
export const getSlideById = (id) => slideById.get(id) ?? null;
export const getSlideByFips = (fips) => slideByFips.get(fips) ?? null;
export const getSlideByAbbr = (abbr) => getSlideByFips(stateByAbbr.get(abbr)?.fips);

// Everything a future quiz mode needs is already in the data files: for each
// state a name, capital, capital coordinates, FIPS id for map hit-testing,
// neighbours and region. This is the shape a quiz would read.
export const quizPool = {
  states: states.map((s) => ({
    name: s.name,
    abbreviation: s.abbreviation,
    fips: s.fips,
    capital: s.capital,
    capitalCoords: s.capitalCoords,
    region: s.region,
    neighboringStates: s.neighboringStates,
  })),
  features: features.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    statesTouched: f.statesTouched,
    focus: f.focus,
  })),
};
