# Geo Skillz

A story-first geography study deck. Phase 1 covers all 50 US states plus nine
major US geographic features. Built to be flipped through on a tablet or phone
during a study session.

**Live site:** https://complexityofdharma.github.io/geo-skillz/

## The idea

Geography sticks when it is attached to a story. Every slide leads with a
memory hook — where the name came from, why the capital is where it is — and
only then gives you the facts. "Nevada" is Spanish for *snow-covered*, which is
absurd for the driest state in America until you realise it is named for the
mountains that steal all its rain. Once that clicks, you don't forget it.

## Running it

```bash
npm install
npm run dev        # local dev server
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run check      # validate data + render all 60 slides in Node
npm run check:ui   # drive the built site in a real browser (see below)
```

## How it deploys

Pushing to `main` triggers `.github/workflows/deploy.yml`, which validates the
data, builds, and publishes `dist/` to the `gh-pages` branch. In the repo's
**Settings → Pages**, set the source to **Deploy from a branch → `gh-pages` /
(root)**.

The Vite `base` is `/geo-skillz/` to match the Pages sub-path. If the repo is
ever renamed, change `base` in `vite.config.js` to match, or build with
`VITE_BASE=/ npm run build` for a root-level host.

## Data format

**All content lives in data files. There are no facts hardcoded in any render
code.** This is the rule that makes Phase 2 and quiz mode cheap.

### States — `src/data/states/<state>.json`

One file per state. `src/data/index.js` picks them up with `import.meta.glob`,
so **adding a file is all you do — no code changes anywhere.**

```jsonc
{
  "name": "Virginia",
  "abbreviation": "VA",
  "fips": "51",                    // must match a us-atlas geometry id
  "nickname": "Old Dominion",      // optional
  "capital": "Richmond",
  "capitalCoords": [-77.4360, 37.5407],   // [longitude, latitude] - marker on the zoom map
  "region": "South / Mid-Atlantic",
  "statehoodOrder": 10,
  "statehoodYear": 1788,
  "nameStory": "The memory hook for the state's name.",
  "capitalStory": "The memory hook for the capital.",
  "neighboringStates": ["MD", "NC", "TN", "KY", "WV", "DC"],
  "majorFeatures": [
    { "name": "Chesapeake Bay", "type": "bay",
      "note": "Largest estuary in the US",
      "coords": [-76.1, 37.4] }    // optional; omit and it is listed but not mapped
  ],
  "funFacts": ["Short, punchy, testable."],
  "whyItMatters": "Optional. Only include it where there is a genuine, well-known connection."
}
```

`fips` is the join key to the map. `us-atlas` identifies each state geometry by
its two-digit FIPS code, and `npm run check:data` fails the build if a code is
wrong or names a different state than the file claims.

### Features — `src/data/features.json`

An array of cross-state features. `focus.bbox` frames the zoomed map, and
`statesTouched` (abbreviations) drives the highlight on the national map.

```jsonc
{
  "id": "great-lakes",
  "name": "The Great Lakes",
  "type": "lakes",
  "subtitle": "One fifth of the world's fresh surface water",
  "story": "The lead memory hook.",
  "nameStory": "Where the name came from.",
  "mnemonic": {                    // optional - renders the highlighted block
    "key": "HOMES",
    "note": "How to use it.",
    "items": [{ "letter": "H", "label": "Huron", "note": "Longest shoreline" }]
  },
  "namingTimeline": [              // optional - see "Disputed names" below
    { "year": "1896", "label": "Mount McKinley", "detail": "What happened." }
  ],
  "disputedName": true,            // optional - shows a badge next to the title
  "statesTouched": ["MN", "WI", "IL", "IN", "MI", "OH", "PA", "NY"],
  "focus": { "bbox": [[-93.0, 40.4], [-74.2, 49.2]] },  // [[west, south], [east, north]]
  "markers": [{ "name": "Superior", "coords": [-87.6, 47.7] }],
  "keyFacts": ["..."],
  "whyItMatters": "Optional."
}
```

## Adding Phase 2 (world geography)

Adding more slides *of an existing kind* is a pure data change. Adding a whole
new **section** of the deck is one line of code:

1. Create `src/data/countries/` and drop in JSON files using the state shape.
2. In `src/data/index.js`, add one `import.meta.glob` for the new folder and one
   entry in `buildDeck()`.

The reason it isn't literally zero code is that world geography needs different
map geometry — `us-atlas` only covers the US. A world deck would use
`world-atlas` (same authors, same public domain terms) and a matching
`countryCode` join key instead of `fips`.

## Quiz mode

Not built yet, deliberately. The data layer is already shaped for it:
`src/data/index.js` exports a `quizPool` giving each state's name, capital,
capital coordinates, FIPS id, region and neighbours, plus each feature's name,
bounding box and states touched. That covers the three planned modes — click the
highlighted state, type the capital, name the feature on the map — without any
change to the content files.

## Disputed names

Some place names are live political questions, and the deck says so rather than
quietly picking a winner. Denali / Mount McKinley carries a `namingTimeline`
running from the centuries-old Koyukon Athabascan name through the 1896
prospector's renaming, federal recognition in 1917, the 2015 change to Denali,
and the January 2025 executive order changing it back. The slide presents both
arguments and does not resolve them.

**If the federal name changes again,** edit the `denali` entry in
`src/data/features.json`: add a row to `namingTimeline` and update the last line
of `keyFacts`. Nothing else needs to change.

## Maps and attribution

State boundaries come from [`us-atlas`](https://github.com/topojson/us-atlas),
which is public domain and derived from US Census Bureau TIGER data. No scraped
or copyrighted map images are used anywhere.

One consequence worth knowing: `us-atlas` contains **political boundaries only**
— no rivers, coastal detail beyond state outlines, terrain or hydrography. So a
zoomed map of a feature sitting well inside one state (Denali, the Grand Canyon)
shows the labelled markers over a graticule rather than the landform itself. The
markers are correctly positioned; there is simply no terrain data to draw. Adding
relief would mean pulling in a second, larger dataset.

## Checks

`npm run check` runs two checks. `check:data` validates that every state file has the required fields,
that `fips` matches the right us-atlas geometry, that each capital marker falls
inside its own state's polygon, that neighbour lists agree with each other in
both directions, and that no `focus.bbox` is wound backwards. `scripts/smoke-render.mjs`
renders all 60 slides in Node and fails on NaN coordinates or missing maps.

`npm run check:ui` is separate because it needs both a running preview server
and a local Chrome, so it is not wired into CI. It drives the real site to
verify clicking the overview map, neighbour chips, keyboard navigation, the
jump-to search and hash deep links:

```bash
npm run build && npm run preview   # one shell
npm run check:ui                   # another
```

It expects Chrome at the Windows default path; edit `CHROME` at the top of
`scripts/check-ui.mjs` on another OS.

## Project layout

```
src/
  data/
    states/*.json     one file per state - the content
    features.json     cross-state geographic features
    index.js          globs the data and builds the deck (only file that knows the layout)
  lib/
    atlas.js          loads us-atlas TopoJSON
    geo.js            projections: AlbersUsa for context, centered conic for zooms
    maps.js           renders the two map tiers and their labels
  ui/
    slides.js         slide templates - reads data, holds no facts
    jump.js           searchable jump-to menu
  main.js             navigation, routing, input handling
  style.css
scripts/
  check-data.mjs      data validation (npm run check:data)
  smoke-render.mjs    renders every slide in Node to catch broken geometry
  check-ui.mjs        browser-driven checks for navigation and search
```
