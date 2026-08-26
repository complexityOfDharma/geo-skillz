// Pure tree construction, kept free of import.meta.glob so Node-side scripts
// (scripts/smoke-render.mjs) can build the same structure the app does instead
// of reimplementing it and drifting.

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildSections(sectionData, states, features) {
  const fipsByAbbr = new Map(states.map((s) => [s.abbreviation, s.fips]));

  const stateSlide = (data) => ({
    kind: 'state',
    id: slug(data.name),
    title: data.name,
    subtitle: data.capital,
    data,
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
      fipsTouched: (data.statesTouched ?? []).map((a) => fipsByAbbr.get(a)).filter(Boolean),
    },
  });

  return sectionData.map((section) => {
    const categories = (section.categories ?? []).map((category) => {
      const slides =
        category.kind === 'states'
          ? states.map(stateSlide)
          : features.filter((f) => f.category === category.id).map(featureSlide);

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
