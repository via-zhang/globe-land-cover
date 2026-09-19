export interface CoverGroup {
  id: number
  label: string
  color: string
}

export interface Meta {
  generated: string
  source: string
  protocol: string
  total: number
  shardSize: number
  shardCount: number
  epoch: string
  dayRange: [number, number]
  dateRange: [string, string]
  coverGroups: CoverGroup[]
  coverCounts: Record<string, number>
  unclassified: number
  withPhotos: number
  withoutPhotos: number
  columns: string[]
  attribution: Record<string, string>
}

export interface Country {
  code: string
  name: string
  count: number
  /** [west, south, east, north], antimeridian-unwrapped. */
  bbox: [number, number, number, number] | null
}

/** Columnar map index. Every array is parallel and ordered by fid. */
export interface PointIndex {
  fid: number[]
  lon: number[]
  lat: number[]
  /** Days since meta.epoch. */
  d: number[]
  /** Index into countries.json, or 255 when the observation has no country. */
  cc: number[]
  /** Canonical cover group ids present at the site. */
  lc: number[][]
  /** The single group that best represents the site, or -1 if unclassified. */
  pg: number[]
  /** Direction photos actually available, 0-6. */
  pc: number[]
}

export type ColorMode = 'uniform' | 'cover'

/**
 * `globe` renders a sphere when zoomed out and eases into mercator as you zoom
 * in; `mercator` is always flat. MapLibre implements no equal-area projection,
 * so a flat view necessarily exaggerates area away from the equator.
 */
export type Projection = 'globe' | 'mercator'

/** One observation with every attribute the GeoPackage carried. */
export interface Observation {
  fid: number
  lon: number
  lat: number
  [column: string]: string | number | undefined
}

export interface Filters {
  /** Day indices since epoch, inclusive. */
  from: number | null
  to: number | null
  country: string | null
  /** Canonical cover group ids; empty means every group. */
  cover: number[]
  /** Keep observations that carry no classification at all. */
  includeUnclassified: boolean
  /** Only observations with at least one direction photo. */
  photosOnly: boolean
}

export const EMPTY_FILTERS: Filters = {
  from: null,
  to: null,
  country: null,
  cover: [],
  includeUnclassified: true,
  photosOnly: false,
}
