import type { Observation } from './types'

export const DIRECTIONS = ['North', 'East', 'South', 'West', 'Upward', 'Downward'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const DIRECTION_LABEL: Record<Direction, string> = {
  North: 'North',
  East: 'East',
  South: 'South',
  West: 'West',
  Upward: 'Up',
  Downward: 'Down',
}

/** data.globe.gov writes this literal where a photo was moderated away. */
const SENTINELS = new Set(['', 'rejected', 'null', 'none'])

/**
 * First usable URL in a cell.
 *
 * Every cell in this file holds exactly one URL, but the column is free text,
 * so split defensively and take the first — and treat "rejected" as missing.
 */
export function photoUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (SENTINELS.has(text.toLowerCase())) return null
  const first = text.split(/[;,\s]+/)[0]?.trim() ?? ''
  return first.toLowerCase().startsWith('http') ? first : null
}

/** data.globe.gov serves small.jpg beside original.jpg; useful as a placeholder. */
export function previewUrl(url: string): string {
  return url.replace(/\/original\.(jpe?g|png)$/i, '/small.$1')
}

export function directionPhotos(observation: Observation): Record<Direction, string | null> {
  return Object.fromEntries(
    DIRECTIONS.map((direction) => [direction, photoUrl(observation[`${direction}PhotoUrl`])]),
  ) as Record<Direction, string | null>
}

export function featurePhotos(observation: Observation): Array<{ url: string; caption?: string }> {
  const photos: Array<{ url: string; caption?: string }> = []
  for (let i = 1; i <= 4; i += 1) {
    const url = photoUrl(observation[`Feature${i}PhotoUrl`])
    if (!url) continue
    const caption = observation[`Feature${i}Caption`]
    photos.push({ url, caption: typeof caption === 'string' ? caption : undefined })
  }
  return photos
}

export interface Classification {
  percent: number
  code: string
  modifier?: string
  label: string
  /** Text before the first comma, e.g. "Trees" from "Trees, Closely Spaced, ...". */
  group: string
}

// "70% MUC 12 (n) [Trees, Loosely Spaced, Deciduous - Needle Leaved]; 60% ..."
const CLASSIFICATION_RE = /(\d+)%\s*MUC\s*([0-9]+)\s*(?:\(([^)]*)\))?\s*\[([^\]]*)\]/g

export function parseClassifications(value: unknown): Classification[] {
  if (typeof value !== 'string' || !value.trim()) return []
  const out: Classification[] = []
  for (const match of value.matchAll(CLASSIFICATION_RE)) {
    const label = match[4].trim()
    out.push({
      percent: Number(match[1]),
      code: match[2],
      modifier: match[3]?.trim() || undefined,
      label,
      group: label.split(',')[0].trim(),
    })
  }
  return out.sort((a, b) => b.percent - a.percent)
}

/** Colour ramp shared by the cover chips and the classification bars. */
export const GROUP_COLORS: Record<string, string> = {
  Trees: '#2f9e58',
  Woodland: '#2f9e58',
  'Closed Forest': '#2f9e58',
  'Herbaceous/Grassland': '#a3c556',
  'Herbaceous Vegetation': '#a3c556',
  Shrubs: '#c99a3f',
  'Shrubland or Thicket': '#c99a3f',
  'Dwarf-Shrubland or Dwarf-Thicket': '#c99a3f',
  Cultivated: '#e0b33a',
  'Cultivated Land': '#e0b33a',
  Barren: '#b08968',
  'Barren Land': '#b08968',
  Urban: '#c96f6f',
  'Open Water': '#4a9fd8',
  Wetland: '#5ec0b0',
  Wetlands: '#5ec0b0',
}

export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? '#6b7c8f'
}
