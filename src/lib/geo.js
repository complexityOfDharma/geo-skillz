import {
  geoAlbersUsa,
  geoConicEqualArea,
  geoBounds,
  geoCentroid,
  geoGraticule,
  geoPath,
} from 'd3-geo';

// The full-US context projection. AlbersUsa tucks Alaska and Hawaii into insets,
// which is what you want for "where in the country is this".
export function contextProjection(nation, width, height, pad = 8) {
  return geoAlbersUsa().fitExtent(
    [[pad, pad], [width - pad, height - pad]],
    nation
  );
}

// A zoom projection fitted to one shape. AlbersUsa is wrong here - it would keep
// Alaska and Hawaii in their inset positions. Instead build a conic centered on
// the target, which behaves for every state including Alaska's antimeridian span.
export function zoomProjection(target, width, height, pad = 26) {
  const [cx, cy] = geoCentroid(target);
  const [[, south], [, north]] = geoBounds(target);
  const dLat = north - south || 1;
  return geoConicEqualArea()
    .rotate([-cx, 0])
    .center([0, cy])
    .parallels([south + dLat / 6, north - dLat / 6])
    .fitExtent([[pad, pad], [width - pad, height - pad]], target);
}

// Features are framed by a lon/lat bounding box rather than a polygon, so wrap
// the box in a Feature that the same fitting logic can consume.
//
// Winding matters here. d3-geo treats rings as spherical polygons, so a ring
// wound the other way describes the whole globe minus the box, and fitExtent
// then zooms to the entire planet. This order keeps the small box as the
// interior - scripts/check-data.mjs asserts it.
export function bboxFeature([[w, s], [e, n]]) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[w, s], [w, n], [e, n], [e, s], [w, s]]],
    },
  };
}

export const pathFor = (projection) => geoPath(projection);

// Some feature zooms (Denali, the Grand Canyon) land inside a single state,
// where us-atlas has no boundary lines to draw at all. A graticule gives the
// eye a frame of reference so the map does not read as an empty box.
export function graticuleFor([[w, s], [e, n]]) {
  const span = Math.max(Math.abs(e - w), Math.abs(n - s));
  const step = span > 20 ? 5 : span > 8 ? 2 : span > 3 ? 1 : 0.5;
  return geoGraticule()
    .stepMinor([step, step])
    .stepMajor([step * 100, step * 100])
    .extentMinor([[w - step, s - step], [e + step, n + step]])();
}
