// Hash routes are hierarchical: #/<section>/<category>/<slide>
//
//   #/                      landing
//   #/us/states             a category index
//   #/us/states/virginia    a slide
//
// The first build shipped flat routes (#/virginia, #/denali) and those links may
// already be bookmarked, so parse() reports a single bare segment as a legacy id
// for the caller to resolve and rewrite.

export function parse(hash) {
  const path = String(hash ?? '').replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!path) return { kind: 'landing' };

  const [sectionId, categoryId, slideId] = path.split('/');
  if (!categoryId) return { kind: 'legacy', id: sectionId };
  if (!slideId) return { kind: 'category', sectionId, categoryId };
  return { kind: 'slide', sectionId, categoryId, slideId };
}

export function format(route) {
  if (!route || route.kind === 'landing') return '#/';
  if (route.kind === 'category') return `#/${route.sectionId}/${route.categoryId}`;
  return `#/${route.sectionId}/${route.categoryId}/${route.slideId}`;
}

// One level up: slide -> its category index -> landing.
export function parentOf(route) {
  if (!route || route.kind === 'landing') return null;
  if (route.kind === 'category') return { kind: 'landing' };
  return { kind: 'category', sectionId: route.sectionId, categoryId: route.categoryId };
}

export const sameRoute = (a, b) => format(a) === format(b);
