import { useMemo } from 'react'

const RAD = Math.PI / 180

/**
 * Where on Earth this observation sits, as an orthographic globe centred on
 * the point itself.
 *
 * Deliberately not a country silhouette: `CountryName` in this file is
 * registration-derived, so a few hundred records would show an outline of the
 * wrong continent. A globe centred on the geometry is right for every record.
 */
interface Props {
  lon: number
  lat: number
  outlines: GeoJSON.FeatureCollection
  size?: number
}

type Ring = number[][]

function ringsOf(collection: GeoJSON.FeatureCollection): Ring[] {
  const rings: Ring[] = []
  for (const feature of collection.features) {
    const geometry = feature.geometry
    if (geometry.type === 'Polygon') {
      rings.push(geometry.coordinates[0] as Ring)
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) rings.push(polygon[0] as Ring)
    }
  }
  return rings
}

export default function LocatorGlobe({ lon, lat, outlines, size = 56 }: Props) {
  const radius = size / 2
  const rings = useMemo(() => ringsOf(outlines), [outlines])

  // The globe barely moves for sub-degree changes, so quantise the centre and
  // let identical neighbours reuse the same projected path.
  const centreLon = Math.round(lon * 2) / 2
  const centreLat = Math.round(lat * 2) / 2

  const land = useMemo(() => {
    const lon0 = centreLon * RAD
    const lat0 = centreLat * RAD
    const sinLat0 = Math.sin(lat0)
    const cosLat0 = Math.cos(lat0)
    const parts: string[] = []

    for (const ring of rings) {
      let drawing = false
      for (const point of ring) {
        const dLon = point[0] * RAD - lon0
        const phi = point[1] * RAD
        const cosPhi = Math.cos(phi)
        const sinPhi = Math.sin(phi)
        const cosC = sinLat0 * sinPhi + cosLat0 * cosPhi * Math.cos(dLon)
        if (cosC < 0) {
          // Behind the horizon; end the current stroke rather than wrap it
          // across the face of the globe.
          drawing = false
          continue
        }
        const x = radius + cosPhi * Math.sin(dLon) * radius
        const y = radius - (cosLat0 * sinPhi - sinLat0 * cosPhi * Math.cos(dLon)) * radius
        parts.push(`${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
        drawing = true
      }
    }
    return parts.join('')
  }, [rings, centreLon, centreLat, radius])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Globe showing the observation location at ${Math.abs(lat).toFixed(1)} degrees ${
        lat >= 0 ? 'north' : 'south'
      }, ${Math.abs(lon).toFixed(1)} degrees ${lon >= 0 ? 'east' : 'west'}`}
    >
      <circle cx={radius} cy={radius} r={radius - 0.5} fill="#0d1620" />
      <path d={land} fill="none" stroke="#3f5468" strokeWidth={0.7} strokeLinejoin="round" />
      <circle
        cx={radius}
        cy={radius}
        r={radius - 0.5}
        fill="none"
        stroke="#243240"
        strokeWidth={1}
      />
      {/* The observation is always dead centre by construction. */}
      <circle cx={radius} cy={radius} r={2.6} fill="#86efac" />
      <circle cx={radius} cy={radius} r={5.5} fill="none" stroke="#86efac" strokeOpacity={0.45} />
    </svg>
  )
}
