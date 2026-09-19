import { useEffect, useRef } from 'react'
import maplibregl, {
  type DataDrivenPropertyValueSpecification,
  type FilterSpecification,
} from 'maplibre-gl'
import type { ColorMode, CoverGroup, Projection } from '../lib/types'

const SOURCE = 'observations'
const OUTLINE_SOURCE = 'country-outlines'
const POINT_LAYER = 'observation-points'
const SELECTED_LAYER = 'observation-selected'

/**
 * OpenFreeMap's dark style: OpenStreetMap data served as vector tiles with no
 * API key and no watermark. (CARTO's dark basemap now stamps "API KEY
 * REQUIRED" across every tile, so it is not usable unauthenticated.)
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

/** Country borders the style already draws from OSM, restyled for contrast. */
const OSM_BOUNDARY_LAYERS = ['boundary_country_z0-4', 'boundary_country_z5-']

const UNIFORM_COLOR = '#86efac'
const UNCLASSIFIED_COLOR = '#64748b'

/** Share of the shorter viewport edge the globe should span on first paint. */
const GLOBE_FILL = 0.88

/**
 * Opening zoom, chosen so the globe fills the frame rather than floating in
 * it. MapLibre's world is 512·2^zoom pixels around, so the sphere renders
 * roughly that divided by π across — invert it for the size we want. A fixed
 * zoom cannot work here: one that fills a desktop window overflows a phone.
 */
function initialZoom(width: number, height: number): number {
  const shortest = Math.min(width, height)
  if (shortest <= 0) return 1.6
  const zoom = Math.log2((GLOBE_FILL * shortest * Math.PI) / 512)
  return Math.max(1, Math.min(zoom, 3.2))
}

/**
 * Either one green for every observation, or the site's dominant land cover.
 * `pg` is -1 where nothing was ever classified, which is most of the file, so
 * those points stay a neutral slate rather than borrowing a category's colour.
 */
function circleColor(
  mode: ColorMode,
  groups: CoverGroup[],
): DataDrivenPropertyValueSpecification<string> {
  if (mode === 'uniform') return UNIFORM_COLOR
  // The style spec types a `match` as a fixed-arity tuple, which a spread of
  // runtime-length cases cannot satisfy; the shape is correct at run time.
  const expression = [
    'match',
    ['get', 'pg'],
    ...groups.flatMap((group) => [group.id, group.color]),
    UNCLASSIFIED_COLOR,
  ]
  return expression as unknown as DataDrivenPropertyValueSpecification<string>
}

interface Props {
  points: GeoJSON.FeatureCollection
  outlines: GeoJSON.FeatureCollection
  filter: FilterSpecification
  selectedFid: number | null
  /** [west, south, east, north] to fly to, or null. */
  fitBounds: [number, number, number, number] | null
  colorMode: ColorMode
  coverGroups: CoverGroup[]
  projection: Projection
  onSelect: (fid: number) => void
}

export default function MapView({
  points,
  outlines,
  filter,
  selectedFid,
  fitBounds,
  colorMode,
  coverGroups,
  projection,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // Read at construction time only; changes flow through the effect below.
  const projectionRef = useRef(projection)
  projectionRef.current = projection

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [10, 25],
      zoom: initialZoom(container.clientWidth, container.clientHeight),
      minZoom: 1,
      maxZoom: 18,
      attributionControl: false,
      // Points are the content here; a tilted horizon only gets in the way.
      pitchWithRotate: false,
      dragRotate: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          'Boundaries: <a href="https://www.naturalearthdata.com/">Natural Earth</a> · Observations: <a href="https://www.globe.gov/">NASA GLOBE</a> · Imagery: <a href="https://planetarycomputer.microsoft.com/">Planetary Computer</a>',
      }),
      'bottom-right',
    )

    map.on('load', () => {
      // Projection is not a constructor option in MapLibre 5, so it is applied
      // as soon as the style is ready — before the first layer is added, so
      // there is no flash of the wrong projection.
      map.setProjection({ type: projectionRef.current })

      // The basemap's own country borders are near-invisible on dark. Lift
      // them so they carry the close-up view, where Natural Earth's 1:110m
      // outlines would be far too coarse.
      for (const id of OSM_BOUNDARY_LAYERS) {
        if (!map.getLayer(id)) continue
        map.setPaintProperty(id, 'line-color', '#8fa3ba')
        map.setPaintProperty(id, 'line-opacity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 0,
          5, 0.45,
          10, 0.3,
        ])
        map.setPaintProperty(id, 'line-width', [
          'interpolate',
          ['linear'],
          ['zoom'],
          3, 0.6,
          8, 1.2,
        ])
      }

      map.addSource(OUTLINE_SOURCE, { type: 'geojson', data: outlines })
      map.addSource(SOURCE, { type: 'geojson', data: points })

      // Natural Earth outlines carry the world view: one clean, continuous
      // border per country, fading out as the OSM boundaries take over.
      map.addLayer({
        id: 'country-outline-glow',
        type: 'line',
        source: OUTLINE_SOURCE,
        paint: {
          'line-color': '#5f748a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2.4, 5, 3.4],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.22, 4, 0.1, 5.5, 0],
          'line-blur': 2,
        },
      })
      map.addLayer({
        id: 'country-outline',
        type: 'line',
        source: OUTLINE_SOURCE,
        paint: {
          'line-color': '#9db2c9',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 4, 0.35, 5.5, 0],
        },
      })

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-color': circleColor(colorMode, coverGroups),
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1, 1.7,
            4, 2.6,
            8, 4.5,
            12, 6.5,
            16, 9,
          ],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 8, 0.88],
          'circle-stroke-color': '#0b3b21',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 0, 9, 0.8],
        },
      })

      map.addLayer({
        id: SELECTED_LAYER,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'fid'], -1],
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 5, 10, 9],
          'circle-stroke-color': '#86efac',
          'circle-stroke-width': 3,
          'circle-stroke-opacity': 0.9,
        },
      })

      readyRef.current = true
      map.setFilter(POINT_LAYER, filter)
      if (selectedFid !== null) map.setFilter(SELECTED_LAYER, ['==', ['get', 'fid'], selectedFid])
    })

    const pick = (event: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(POINT_LAYER)) return
      // A small box makes 2-3 px dots reachable by touch as well as mouse.
      const pad = 8
      const features = map.queryRenderedFeatures(
        [
          [event.point.x - pad, event.point.y - pad],
          [event.point.x + pad, event.point.y + pad],
        ],
        { layers: [POINT_LAYER] },
      )
      if (features.length === 0) return
      const fid = features[0].properties?.fid
      if (typeof fid === 'number') onSelectRef.current(fid)
    }
    map.on('click', pick)

    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }
    map.on('mouseenter', POINT_LAYER, enter)
    map.on('mouseleave', POINT_LAYER, leave)

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
    // The map is created once; data and filters flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setFilter(POINT_LAYER, filter)
  }, [filter])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setFilter(SELECTED_LAYER, ['==', ['get', 'fid'], selectedFid ?? -1])
  }, [selectedFid])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setPaintProperty(POINT_LAYER, 'circle-color', circleColor(colorMode, coverGroups))
  }, [colorMode, coverGroups])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setProjection({ type: projection })
  }, [projection])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !fitBounds) return
    map.fitBounds(fitBounds, { padding: 64, maxZoom: 9, duration: 900 })
  }, [fitBounds])

  // The inner div is the map container. It has to be a child rather than the
  // positioned element itself: maplibre-gl.css is unlayered, so its
  // `.maplibregl-map { position: relative }` outranks any Tailwind utility
  // placed on the same element and collapses the box to zero height.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="map-vignette" aria-hidden />
    </div>
  )
}
