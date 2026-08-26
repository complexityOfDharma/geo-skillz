// The only place that knows how data files become slides.
//
// Adding a state (or, in Phase 2, any new place file) means dropping a JSON
// file into the folder below - the glob picks it up at build time and no code
// here changes. Adding a whole new SECTION of the deck (world geography) means
// adding one more glob and one more entry to buildDeck().
import featureData from './features.json';

const stateModules = import.meta.glob('./states/*.json', { eager: true, import: 'default' });

export const states = Object.values(stateModules).sort((a, b) => a.name.localeCompare(b.name));
export const features = featureData;

export const stateByAbbr = new Map(states.map((s) => [s.abbreviation, s]));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildDeck() {
  return [
    { kind: 'overview', id: 'overview', title: 'The United States', short: 'Overview' },
    ...states.map((data) => ({
      kind: 'state',
      id: slug(data.name),
      title: data.name,
      short: data.name,
      subtitle: data.capital,
      data,
    })),
    ...features.map((data) => ({
      kind: 'feature',
      id: data.id,
      title: data.name,
      short: data.name,
      subtitle: data.subtitle,
      // us-atlas identifies geometries by FIPS, so resolve the abbreviations
      // the data files use into ids the map can match.
      data: {
        ...data,
        fipsTouched: (data.statesTouched ?? [])
          .map((abbr) => stateByAbbr.get(abbr)?.fips)
          .filter(Boolean),
      },
    })),
  ];
}

// Everything a future quiz mode needs is already in the data files: for each
// state a name, capital, capital coordinates, FIPS id for map hit-testing,
// neighbours, and region. This is the shape a quiz would read.
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
    statesTouched: f.statesTouched,
    focus: f.focus,
  })),
};
