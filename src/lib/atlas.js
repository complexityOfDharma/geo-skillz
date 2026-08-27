// Loads the us-atlas TopoJSON once and hands back plain GeoJSON.
// us-atlas is public domain, derived from US Census Bureau TIGER data.
import { feature } from 'topojson-client';
import atlasUrl from 'us-atlas/states-10m.json?url';
import context from '../data/geometry/context.json';
import worldUrl from 'world-atlas/countries-50m.json?url';
import worldShapesUrl from '../data/geometry/world-shapes.json?url';

let pending;

export function loadAtlas() {
  if (!pending) {
    pending = fetch(atlasUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`could not load map data (${res.status})`);
        return res.json();
      })
      .then((topo) => {
        const states = feature(topo, topo.objects.states);
        return {
          states,
          nation: feature(topo, topo.objects.nation),
          byFips: new Map(states.features.map((f) => [f.id, f])),
          // Canada and Mexico, drawn as background on close-up maps only.
          context,
        };
      });
  }
  return pending;
}

// Country geometry for The World. Loaded only when the reader actually opens a
// world slide, so the US section never pays the 700 KB.
let worldPending;

export function loadWorldAtlas() {
  if (!worldPending) {
    worldPending = Promise.all([
      fetch(worldUrl).then((res) => {
        if (!res.ok) throw new Error(`could not load world map data (${res.status})`);
        return res.json();
      }),
      fetch(worldShapesUrl).then((res) => {
        if (!res.ok) throw new Error(`could not load world shapes (${res.status})`);
        return res.json();
      }),
    ])
      .then(([topo, shapes]) => {
        const countries = feature(topo, topo.objects.countries);
        return {
          countries,
          land: feature(topo, topo.objects.land),
          byName: new Map(countries.features.map((f) => [f.properties.name, f])),
          shapes,
        };
      });
  }
  return worldPending;
}
