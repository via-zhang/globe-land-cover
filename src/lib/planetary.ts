/**
 * Microsoft Planetary Computer.
 *
 * Both APIs used here are anonymous and send `access-control-allow-origin: *`,
 * so the browser talks to them directly - no key, no proxy.
 *
 *   STAC search  /api/stac/v1/search              which scenes cover the point
 *   Data API     /api/data/v1/item/bbox/...png    a rendered 1 km chip
 *                /api/data/v1/item/point/...      the pixel value at the point
 */

const STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
const DATA = 'https://planetarycomputer.microsoft.com/api/data/v1'

export type BBox = [number, number, number, number]

/** Square of `meters` on a side, centred on the observation. */
export function bboxAround(lon: number, lat: number, meters = 1000): BBox {
  const halfLat = meters / 2 / 111_320
  const halfLon = halfLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat]
}

interface StacItem {
  id: string
  collection: string
  properties: Record<string, unknown>
  assets: Record<string, { href: string }>
}

async function search(
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<StacItem[]> {
  const response = await fetch(`${STAC}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(`STAC ${response.status}`)
  const json = (await response.json()) as { features?: StacItem[] }
  return json.features ?? []
}

function cropUrl(
  collection: string,
  item: string,
  bbox: BBox,
  params: Record<string, string | string[]>,
  size = 384,
): string {
  const query = new URLSearchParams({ collection, item })
  for (const [key, value] of Object.entries(params)) {
    // `assets` legitimately repeats - Landsat true colour needs red+green+blue.
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v))
    else query.set(key, value)
  }
  const box = bbox.map((v) => v.toFixed(6)).join(',')
  return `${DATA}/item/bbox/${box}/${size}x${size}.png?${query}`
}

async function pointValue(
  collection: string,
  item: string,
  lon: number,
  lat: number,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<number | null> {
  const query = new URLSearchParams({ collection, item, ...params })
  const response = await fetch(`${DATA}/item/point/${lon},${lat}?${query}`, { signal })
  if (!response.ok) return null
  const json = (await response.json()) as { values?: Array<number | null> }
  const value = json.values?.[0]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** ESA WorldCover 10 m class codes. */
const WORLDCOVER_CLASSES: Record<number, string> = {
  10: 'Tree cover',
  20: 'Shrubland',
  30: 'Grassland',
  40: 'Cropland',
  50: 'Built-up',
  60: 'Bare / sparse vegetation',
  70: 'Snow and ice',
  80: 'Permanent water bodies',
  90: 'Herbaceous wetland',
  95: 'Mangroves',
  100: 'Moss and lichen',
}

export interface Chip {
  key: string
  title: string
  collection: string
  /** Rendered 1 km image, or null when nothing covers this point. */
  imageUrl: string | null
  /** Scene date, where the layer has one. */
  date?: string
  /** Pixel value at the observation, already formatted. */
  readout?: { label: string; value: string }
  /** Extra context, e.g. cloud cover or the sensor. */
  note?: string
  /** Shown instead of an image when the layer has no coverage here. */
  empty?: string
}

/** Sort helper: closest acquisition to the observation date. */
function nearestTo(target: number) {
  return (a: StacItem, b: StacItem) => {
    const ta = Date.parse(String(a.properties.datetime ?? ''))
    const tb = Date.parse(String(b.properties.datetime ?? ''))
    return Math.abs(ta - target) - Math.abs(tb - target)
  }
}

function cloudOf(item: StacItem): number {
  const value = item.properties['eo:cloud_cover']
  return typeof value === 'number' ? value : 100
}

function dateOf(item: StacItem): string {
  return String(item.properties.datetime ?? '').slice(0, 10)
}

/**
 * Pick a scene that is both near the observation date and reasonably clear.
 * Prefer the clearest scene within a year; fall back to the nearest in time.
 */
function pickOptical(items: StacItem[], target: number): StacItem | undefined {
  if (items.length === 0) return undefined
  const clear = items.filter((item) => cloudOf(item) < 20)
  return (clear.length > 0 ? clear : items).sort(nearestTo(target))[0]
}

const YEAR = 365 * 86_400_000

async function sentinel2(
  lon: number,
  lat: number,
  bbox: BBox,
  target: number,
  signal: AbortSignal,
): Promise<Chip[]> {
  const items = await search(
    {
      collections: ['sentinel-2-l2a'],
      bbox,
      datetime: `${new Date(target - YEAR).toISOString()}/${new Date(target + YEAR).toISOString()}`,
      limit: 40,
    },
    signal,
  )
  // Empty means no usable scene, which is the caller's cue to fall back to
  // Landsat rather than show a placeholder.
  const item = pickOptical(items, target)
  if (!item) return []

  const ndviExpression = '(B08-B04)/(B08+B04)'
  const ndvi = await pointValue(
    'sentinel-2-l2a',
    item.id,
    lon,
    lat,
    { expression: ndviExpression, asset_as_band: 'true' },
    signal,
  )

  return [
    {
      key: 's2-tc',
      title: 'Sentinel-2 true color',
      collection: 'sentinel-2-l2a',
      date: dateOf(item),
      note: `10 m · ${cloudOf(item).toFixed(0)}% cloud`,
      imageUrl: cropUrl('sentinel-2-l2a', item.id, bbox, {
        assets: 'visual',
        asset_bidx: 'visual|1,2,3',
      }),
    },
    {
      key: 's2-ndvi',
      title: 'Sentinel-2 NDVI',
      collection: 'sentinel-2-l2a',
      date: dateOf(item),
      note: 'Vegetation index, same scene',
      imageUrl: cropUrl('sentinel-2-l2a', item.id, bbox, {
        expression: ndviExpression,
        asset_as_band: 'true',
        rescale: '-1,1',
        colormap_name: 'rdylgn',
      }),
      readout:
        ndvi === null
          ? undefined
          : { label: 'NDVI at point', value: ndvi.toFixed(2) },
    },
  ]
}

/** Only used where Sentinel-2 cannot supply an optical view. */
async function landsat(
  bbox: BBox,
  target: number,
  signal: AbortSignal,
  reason: string,
): Promise<Chip> {
  const items = await search(
    {
      collections: ['landsat-c2-l2'],
      bbox,
      datetime: `${new Date(target - 2 * YEAR).toISOString()}/${new Date(target + 2 * YEAR).toISOString()}`,
      limit: 40,
    },
    signal,
  )
  const item = pickOptical(items, target)
  if (!item) {
    return {
      key: 'landsat',
      title: 'Landsat true color',
      collection: 'landsat-c2-l2',
      imageUrl: null,
      empty: 'No Landsat scene within two years of this observation.',
    }
  }
  return {
    key: 'landsat',
    title: 'Landsat true color',
    collection: 'landsat-c2-l2',
    date: dateOf(item),
    note: `30 m · ${String(item.properties.platform ?? 'Landsat')} · ${reason}`,
    imageUrl: cropUrl('landsat-c2-l2', item.id, bbox, {
      assets: ['red', 'green', 'blue'],
      color_formula: 'gamma RGB 2.7, saturation 1.5, sigmoidal RGB 15 0.55',
    }),
  }
}

async function elevation(
  lon: number,
  lat: number,
  bbox: BBox,
  signal: AbortSignal,
): Promise<Chip> {
  const items = await search(
    { collections: ['cop-dem-glo-30'], bbox, limit: 1 },
    signal,
  )
  const item = items[0]
  if (!item) {
    return {
      key: 'dem',
      title: 'Copernicus DEM',
      collection: 'cop-dem-glo-30',
      imageUrl: null,
      empty: 'Outside Copernicus DEM coverage.',
    }
  }

  // Rescale around the local elevation, otherwise a 1 km chip of gentle
  // terrain renders as one flat colour.
  const metres = await pointValue('cop-dem-glo-30', item.id, lon, lat, { assets: 'data' }, signal)
  const centre = metres ?? 0
  return {
    key: 'dem',
    title: 'Copernicus DEM',
    collection: 'cop-dem-glo-30',
    note: '30 m elevation',
    imageUrl: cropUrl('cop-dem-glo-30', item.id, bbox, {
      assets: 'data',
      rescale: `${(centre - 60).toFixed(0)},${(centre + 60).toFixed(0)}`,
      colormap_name: 'terrain',
    }),
    readout:
      metres === null
        ? undefined
        : { label: 'Elevation at point', value: `${metres.toFixed(1)} m` },
  }
}

async function worldCover(
  lon: number,
  lat: number,
  bbox: BBox,
  signal: AbortSignal,
): Promise<Chip> {
  const items = await search({ collections: ['esa-worldcover'], bbox, limit: 4 }, signal)
  // The collection holds 2020 and 2021 tiles; prefer the newer one.
  const item = items.sort((a, b) => dateOf(b).localeCompare(dateOf(a)))[0]
  if (!item) {
    return {
      key: 'worldcover',
      title: 'ESA WorldCover',
      collection: 'esa-worldcover',
      imageUrl: null,
      empty: 'Outside ESA WorldCover coverage.',
    }
  }

  const code = await pointValue('esa-worldcover', item.id, lon, lat, { assets: 'map' }, signal)
  return {
    key: 'worldcover',
    title: 'ESA WorldCover',
    collection: 'esa-worldcover',
    date: dateOf(item),
    note: '10 m land cover',
    imageUrl: cropUrl('esa-worldcover', item.id, bbox, {
      assets: 'map',
      colormap_name: 'esa-worldcover',
    }),
    readout:
      code === null
        ? undefined
        : {
            label: 'Class at point',
            value: WORLDCOVER_CLASSES[code] ?? `Class ${code}`,
          },
  }
}

/** Sentinel-2 began routine acquisition here; earlier observations need Landsat. */
const SENTINEL2_START = Date.parse('2015-06-27T00:00:00Z')

export async function loadChips(
  lon: number,
  lat: number,
  measuredDate: string,
  signal: AbortSignal,
): Promise<Chip[]> {
  const bbox = bboxAround(lon, lat, 1000)
  const target = Date.parse(`${measuredDate.slice(0, 10)}T00:00:00Z`)
  const preSentinel = target < SENTINEL2_START

  /**
   * One optical view, not two. Sentinel-2 is preferred at 10 m; Landsat only
   * stands in where Sentinel-2 cannot — before the mission began, or where no
   * scene covers the point.
   */
  const optical = async (): Promise<Chip[]> => {
    if (!preSentinel) {
      const chips = await sentinel2(lon, lat, bbox, target, signal)
      if (chips.length > 0) return chips
    }
    const chip = await landsat(
      bbox,
      target,
      signal,
      preSentinel ? 'predates Sentinel-2' : 'no Sentinel-2 scene here',
    )
    return [chip]
  }

  const settled = await Promise.allSettled([
    optical(),
    elevation(lon, lat, bbox, signal).then((chip) => [chip]),
    worldCover(lon, lat, bbox, signal).then((chip) => [chip]),
  ])
  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
}

export { WORLDCOVER_CLASSES }
