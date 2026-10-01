# GLOBE Land Cover Explorer

An interactive map of 60k+ [NASA GLOBE](https://www.globe.gov/) land cover
observations. Click a point to open its six direction photos as a navigable
360° view, read every field the GeoPackage carries, and compare the site
against satellite imagery for the surrounding km².

Tech stack: React app that draws a map with MapLibre and a photo cube with Three.js.

## Running it

```bash
npm install
npm run data
npm run dev
```

Re-run `npm run data` whenever the GeoPackage changes.

## Panorama

The six photos map onto the inside of a box: `[+X, -X, +Y, -Y, +Z, -Z]` reads
as east, west, up, down, south, north with the camera at the origin looking
down `-Z`. Materials use `BackSide`, which mirrors each face horizontally, so
the canvas compositor mirrors the photo back before uploading it.

## Satellite context

Four tiles per observation from the [Planetary
Computer](https://planetarycomputer.microsoft.com/), covering 1 km × 1 km:
Sentinel-2 true colour and NDVI, Copernicus DEM, and ESA WorldCover. The DEM
and WorldCover tiles also read the pixel value at the exact observation point,
which gives a free cross-check against the record's own `Elevation` and MUC
class.

Observations before 2015-06-27 predate Sentinel-2 (966 records, 1.5% of the
file) so Landsat is used.

## Attribution

- Observations: NASA GLOBE Program
- Basemap: OpenFreeMap, OpenMapTiles, © OpenStreetMap contributors
- Country outlines and zoom extents: Natural Earth (public domain)
- Satellite imagery: Microsoft Planetary Computer
