# Working on geo-skillz

A story-first geography study deck. The audience is a 9th grader using it to
actually learn, so accuracy matters more than volume.

Read `README.md` for the data format and architecture. This file covers the
conventions that are easy to get wrong.

## Every slide must cite its verifiable claims

**This is the rule that matters most.** The content was originally written from
model knowledge, which is exactly why citations exist: to catch what is wrong.

A claim needs a source if it is **checkable**:

| Cite it | Don't bother |
|---|---|
| Numbers — heights, lengths, dates, populations, percentages | Narrative framing and analogies |
| Superlatives — "largest", "only", "first", "deepest" | Etymology where no single authority exists |
| Anything politically contested | Obvious geographic description |
| Every `whyItMatters` claim about current events | Mnemonics |

```jsonc
"sources": [
  { "id": "usgs-whitney", "title": "Mount Whitney", "publisher": "USGS",
    "url": "https://...", "accessed": "2026-08-27" }
],
"funFacts": [
  "A plain string still works and stays uncited.",
  { "text": "Mount Whitney is 14,505 feet.", "source": "usgs-whitney" }
],
"whyItMattersSource": "usgs-whitney"
```

Renders as a numbered "Sources" block at the foot of the slide, with a
superscript marker on each pinned fact.

### Never cite something you have not actually opened

Attaching a plausible-looking URL to an unverified claim is worse than leaving
it uncited, because it manufactures false confidence. Use WebSearch/WebFetch and
read the source. **If the source contradicts the slide, fix the slide** — that is
the point of the exercise, not a failure of it.

Preferred publishers, roughly in order: USGS, NOAA, NASA, US Census Bureau,
National Park Service, Library of Congress, USDA, UN and its agencies, UNESCO,
national statistical agencies, and national mapping agencies. Britannica only
where no primary source exists. Avoid blogs, content farms and AI-written
listicles entirely.

### Coverage ratchets, so it cannot slip

`scripts/check-data.mjs` has `REQUIRE_SOURCES = { states, features }`. While a
flag is `false`, an uncited slide is a warning. **When a section reaches full
coverage, flip its flag to `true`** — from then on CI fails if any slide in it
lacks sources, so new slides cannot ship uncited.

## Other conventions

- **Content lives in data files.** No facts in render code, ever. That rule is
  what lets new categories and sections be added without touching JS.
- **Disputed things stay disputed.** Denali/Mount McKinley carries a
  `namingTimeline` and presents both arguments without resolving them. Where
  facts *are* documented, say so plainly rather than manufacturing balance — the
  Ukraine slide states the 2014 annexation and 2022 invasion as documented
  events, and locates the genuine dispute in the territory's status.
- **Only point-resolvable landmarks get a map marker.** A dot in the middle of
  the Appalachian Mountains tells the reader nothing. Ranges, rivers, plateaus
  and regions stay in the features panel; peaks, caves, passes and confluences
  get a square. See `POINT_TYPES` in the state schema section of the README.
- **Hand-authored geometry is labelled approximate.** Routes like Route 66 exist
  in no public dataset, so their maps say so.

## Traps this codebase has already fallen into

Read these before touching `src/lib/`:

1. **Ring winding.** d3-geo reads a backwards polygon ring as *the whole globe
   minus the shape*, which flood-fills the map. `normalizeWinding()` in
   `build-tree.js` fixes it by measured area — never hand-manage ring direction.
2. **Great-circle bowing.** d3-geo draws each segment as a great circle, so a
   long straight segment between two points at the same latitude bows toward the
   pole. The US/Canada border once rendered 100 km too far north. `densify()` in
   `build-geometry.mjs` re-inserts intermediate points.
3. **Densify vs simplify.** Densification is proportional to the tolerance. A
   fixed quarter-degree step re-inflated continent outlines from 156 KB to
   954 KB by undoing the simplification.
4. **Duplicate place names.** Natural Earth has three rivers called "Colorado",
   one in Argentina. Geometry refs take a `within` bounding box.
5. **Label placement.** Positioning from bounding boxes puts a neighbour's label
   inside the subject. The projections are clipped to the viewport so
   `path.centroid()` describes the *visible* part.
6. **Stale geometry builds.** `shapes.json` is generated. If a feature starts
   referencing Natural Earth and nobody re-runs `npm run build:geometry`, its map
   silently loses its subject. `check-data` fails on that now.

## Before you commit

```bash
npm run check      # data validity + all pages render in Node
npm run build && npm run preview
npm run check:ui   # 39 browser assertions (needs the preview server + Chrome)
```

Work on a branch and merge with `--no-ff`. CI runs `npm run check` before
deploying to GitHub Pages.
