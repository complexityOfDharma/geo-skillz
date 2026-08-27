// Pure tree construction, kept free of import.meta.glob so Node-side scripts
// (scripts/smoke-render.mjs) can build the same structure the app does instead
// of reimplementing it and drifting.

import { geoArea } from 'd3-geo';

// d3-geo reads a ring wound the wrong way as "the entire globe minus this
// shape", which floods the map. Hand-authoring the correct direction is a trap
// nobody should have to think about, so normalise by measurement instead.
export function normalizeWinding(geometry) {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return geometry;
  if (geoArea({ type: 'Feature', properties: {}, geometry }) <= 2 * Math.PI) return geometry;
  const flip = (rings) => rings.map((r) => [...r].reverse());
  return geometry.type === 'Polygon'
    ? { ...geometry, coordinates: flip(geometry.coordinates) }
    : { ...geometry, coordinates: geometry.coordinates.map(flip) };
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildSections(sectionData, states, features, shapes = {}) {
  const byAbbr = new Map(states.map((s) => [s.abbreviation, s]));

  // Geometry comes from two places: shapes.json (subsetted from Natural Earth
  // by scripts/build-geometry.mjs) and inlineParts hand-authored in the data
  // file for routes no public dataset carries.
  const partsFor = (data) =>
    [...(shapes[data.id]?.parts ?? []), ...(data.geometry?.inlineParts ?? [])].map((p) => ({
      ...p,
      geometry: normalizeWinding(p.geometry),
    }));

  const namesFor = (abbrs) =>
    (abbrs ?? [])
      .map((a) => byAbbr.get(a))
      .filter(Boolean)
      .map((s) => ({ fips: s.fips, name: s.name, abbr: s.abbreviation }));

  const stateSlide = (data) => ({
    kind: 'state',
    id: slug(data.name),
    title: data.name,
    subtitle: data.capital,
    // Grey names for the neighbours drawn around the subject on its close-up.
    data: { ...data, neighborStates: namesFor(data.neighboringStates) },
  });

  const featureSlide = (data) => ({
    kind: 'feature',
    id: data.id,
    title: data.name,
    subtitle: data.subtitle,
    data: {
      ...data,
      // us-atlas identifies geometries by FIPS, so resolve the abbreviations the
      // data files use into ids the map can match.
      fipsTouched: (data.statesTouched ?? []).map((a) => byAbbr.get(a)?.fips).filter(Boolean),
      scope: data.section === 'world' ? 'world' : 'us',
      // Names for the grey labels drawn on states the feature crosses.
      touchedStates: namesFor(data.statesTouched),
      geometryParts: partsFor(data),
    },
  });

  return sectionData.map((section) => {
    const categories = (section.categories ?? []).map((category) => {
      const slides =
        category.kind === 'states'
          ? states.map(stateSlide)
          : features
              .filter((f) => f.category === category.id && (f.section ?? 'us') === section.id)
              .map(featureSlide);

      slides.forEach((slide, i) => {
        slide.sectionId = section.id;
        slide.categoryId = category.id;
        slide.indexInCategory = i;
      });

      return { ...category, sectionId: section.id, slides, count: slides.length };
    });
    return { ...section, categories };
  });
}
