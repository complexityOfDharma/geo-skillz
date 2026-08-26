// Loads the us-atlas TopoJSON once and hands back plain GeoJSON.
// us-atlas is public domain, derived from US Census Bureau TIGER data.
import { feature } from 'topojson-client';
import atlasUrl from 'us-atlas/states-10m.json?url';

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
        };
      });
  }
  return pending;
}
