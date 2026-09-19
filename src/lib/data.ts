import type { Country, Meta, Observation, PointIndex } from './types'

const BASE = `${import.meta.env.BASE_URL}data`

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}/${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

export interface Bootstrap {
  meta: Meta
  countries: Country[]
  points: PointIndex
  calendar: Array<[number, number]>
  outlines: GeoJSON.FeatureCollection
}

export async function loadBootstrap(): Promise<Bootstrap> {
  const [meta, countries, points, calendar, outlines] = await Promise.all([
    getJSON<Meta>('meta.json'),
    getJSON<Country[]>('countries.json'),
    getJSON<PointIndex>('points.json'),
    getJSON<Array<[number, number]>>('calendar.json'),
    getJSON<GeoJSON.FeatureCollection>('outlines.json'),
  ])
  return { meta, countries, points, calendar, outlines }
}

/**
 * Full attributes live in fixed-size shards so a click fetches ~40 KB gzipped
 * instead of the 91 MB the complete attribute table would cost.
 */
const shardCache = new Map<number, Promise<Map<number, Observation>>>()

export function loadObservation(fid: number, shardSize: number): Promise<Observation | undefined> {
  const shard = Math.floor((fid - 1) / shardSize)
  let pending = shardCache.get(shard)
  if (!pending) {
    pending = getJSON<Observation[]>(`obs/${String(shard).padStart(4, '0')}.json`).then(
      (records) => new Map(records.map((record) => [record.fid, record])),
    )
    // A failed fetch should not poison the cache for later attempts.
    pending.catch(() => shardCache.delete(shard))
    shardCache.set(shard, pending)
  }
  return pending.then((records) => records.get(fid))
}

/** Build the map source once; filtering afterwards runs through setFilter. */
export function toGeoJSON(points: PointIndex): GeoJSON.FeatureCollection {
  const features = new Array<GeoJSON.Feature>(points.fid.length)
  for (let i = 0; i < points.fid.length; i += 1) {
    const cover = points.lc[i]
    // One boolean per cover group rather than an array or a bitmask: MapLibre
    // has no bitwise operators, and a plain `["get", "lc3"]` is both a valid
    // filter on its own and immune to how array properties survive the
    // GeoJSON worker.
    const properties: Record<string, number | boolean> = {
      fid: points.fid[i],
      d: points.d[i],
      cc: points.cc[i],
      un: cover.length === 0,
      pg: points.pg[i],
      pc: points.pc[i],
    }
    for (let group = 0; group < 8; group += 1) {
      properties[`lc${group}`] = cover.includes(group)
    }
    features[i] = {
      type: 'Feature',
      id: points.fid[i],
      geometry: { type: 'Point', coordinates: [points.lon[i], points.lat[i]] },
      properties,
    }
  }
  return { type: 'FeatureCollection', features }
}
