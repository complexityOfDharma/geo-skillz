# Geo Skillz

A story-first geography study deck. Phase 1 covers all 50 US states plus 26
geographic features, organised into seven browsable categories. Built to be
flipped through on a tablet or phone during a study session.

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
npm run dev        # local dev server  -> http://localhost:5173/geo-skillz/
npm run build      # production build into dist/
npm run preview    # serve the production build -> http://localhost:4173/geo-skillz/
npm run check      # validate data + render every page in Node
npm run check:ui   # drive the built site in a real browser (see Checks below)
```

The `/geo-skillz/` path matters — Vite's `base` is set to it so GitHub Pages
works, so a bare `localhost:5173` will not load the app.

## Structure

The deck is a three-level tree:

```
Section          The United States   (The World is next)
└── Category     States · Landforms · Bodies of Water · Climate & Natural Regions
                 Countries, Regions & Borders · Cities & Population
                 Cultural & Human-Made Features
    └── Slide    Virginia · Denali · The Erie Canal · …
```

Routes mirror it, so any level is linkable:

```
#/                          landing page
#/us/states                 the states index (clickable map + A–Z grid)
#/us/states/virginia        a state slide
#/us/landforms/denali       a feature slide
```

Flat routes from the first build (`#/virginia`) still resolve and are rewritten
to the new path, so old bookmarks keep working.

**Navigation:** the sidebar is always available (a drawer under 900px), every
page carries a breadcrumb, and <kbd>Esc</kbd> goes up one level. Prev/next and
the counter are scoped to the current category — Virginia reads `46 / 50`, not a
position in one undifferentiated pile.

## Data format

**All content lives in data files. There are no facts hardcoded in any render
code.** This is the rule that makes new categories, Phase 2, and quiz mode cheap.

### Hierarchy — `src/data/sections.json`

Defines sections and their categories. A section with `"status": "planned"`
renders as a dimmed "coming soon" tile.

```jsonc
{
  "id": "us",
  "title": "The United States",
  "status": "live",
  "blurb": "Shown under the section heading on the landing page.",
  "categories": [
    { "id": "states", "title": "States", "kind": "states", "icon": "🗺️", "blurb": "…" },
    { "id": "landforms", "title": "Landforms", "kind": "features", "icon": "⛰️", "blurb": "…" }
  ]
}
```

`kind` is `"states"` (slides come from `src/data/states/`) or `"features"`
(slides are the entries in `features.json` whose `category` matches this `id`).

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
its two-digit FIPS code, and `npm run check` fails if a code is wrong or names a
different state than the file claims.

### Features — `src/data/features.json`

An array of cross-state features. `category` files it under a tile,
`focus.bbox` frames the zoomed map, and `statesTouched` drives the highlight on
the national map.

```jsonc
{
  "id": "great-lakes",
  "name": "The Great Lakes",
  "type": "lakes",
  "category": "water",             // must match a category id in sections.json
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

⚠️ **Bounding box winding matters.** d3-geo reads the box as a spherical
polygon, so `[[w,s],[e,n]]` corners are expanded in a specific order. Getting it
backwards makes the box mean *the whole globe minus this region*, and the map
silently zooms out to the entire planet. `npm run check` asserts against this.

## Adding to the deck

| You want to add | What you do |
|---|---|
| A state, or a feature in an existing category | Drop in the JSON. No code. |
| A new category | Add it to `sections.json`, tag features with its `id`. No code. |
| A new section (world geography) | Add it to `sections.json`, plus one `import.meta.glob` in `src/data/index.js` if it needs its own place files. |

The reason a new section isn't literally zero code is map geometry: `us-atlas`
only covers the US. A world section would use `world-atlas` (same authors, same
public domain terms) and a `countryCode` join key instead of `fips`.

## Quiz mode

Not built yet, deliberately — the sidebar carries a visible placeholder for it.
The data layer is already shaped for it: `src/data/index.js` exports a `quizPool`
giving each state's name, capital, capital coordinates, FIPS id, region and
neighbours, plus each feature's name, category, bounding box and states touched.
That covers the three planned modes — click the highlighted state, type the
capital, name the feature on the map — without touching any content file.

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
— no rivers, terrain or hydrography. So a zoomed map of a feature sitting well
inside one state (Denali, the Grand Canyon) shows labelled markers over a
graticule rather than the landform itself. The markers are correctly positioned;
there is simply no terrain data to draw. Adding relief would mean pulling in a
second, much larger dataset.

## Checks

`npm run check` runs two things:

- **`check:data`** — every required field present; `fips` matches the right
  us-atlas geometry; each capital marker falls inside its own state's polygon;
  neighbour lists agree in both directions; every feature names a category that
  exists; no live category is empty; no `focus.bbox` is wound backwards.
- **`check:render`** — renders the landing page, all 7 category pages and all 76
  slides in Node, failing on NaN coordinates, missing maps or double-escaped
  HTML entities.

`npm run check:ui` is separate because it needs both a running preview server
and a local Chrome, so it is not wired into CI. It drives the real site to
verify the landing page, category navigation, backing out with Escape, the
clickable map, breadcrumbs, keyboard nav, search, and legacy deep links:

```bash
npm run build && npm run preview   # one shell
npm run check:ui                   # another
```

It expects Chrome at the Windows default path; edit `CHROME` at the top of
`scripts/check-ui.mjs` on another OS.

## How it deploys

Pushing to `main` triggers `.github/workflows/deploy.yml`, which validates the
data, builds, and publishes `dist/` to the `gh-pages` branch. In the repo's
**Settings → Pages**, set the source to **Deploy from a branch → `gh-pages` /
(root)**.

## Project layout

```
src/
  data/
    sections.json     the Section > Category hierarchy
    states/*.json     one file per state - the content
    features.json     cross-state features, each tagged with a category
    build-tree.js     pure tree construction, shared with the Node checks
    index.js          globs the data and exposes lookups
  lib/
    atlas.js          loads us-atlas TopoJSON
    geo.js            projections: AlbersUsa for context, centered conic for zooms
    maps.js           renders the two map tiers and their labels
    router.js         hash routes, including legacy redirects
  ui/
    landing.js        the landing page
    category.js       category index pages
    slides.js         slide templates - reads data, holds no facts
    sidebar.js        persistent nav / mobile drawer
    jump.js           searchable jump-to menu
  main.js             routing, input handling, view dispatch
  style.css
scripts/
  check-data.mjs      data validation
  smoke-render.mjs    renders every page in Node
  check-ui.mjs        browser-driven navigation checks
```
