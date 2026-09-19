/** Human labels for the GeoPackage's column names. */
const LABELS: Record<string, string> = {
  LandCoverId: 'Land cover ID',
  SiteId: 'Site ID',
  SiteName: 'Site name',
  MeasuredAt: 'Measured at',
  MeasuredDate: 'Measured date',
  DataSource: 'Data source',
  Protocol: 'Protocol',
  Userid: 'Observer ID',
  OrganizationId: 'Organization ID',
  OrganizationName: 'Organization',
  GlobeTeams: 'GLOBE teams',
  CountryName: 'Country',
  CountryCode: 'Country code',
  Elevation: 'Site elevation',
  MeasurementElevation: 'Measured elevation',
  LocationAccuracyM: 'Location accuracy',
  LocationMethod: 'Location method',
  MucCode: 'MUC code',
  MucDescription: 'MUC description',
  MucDetails: 'MUC detail',
  FieldNotes: 'Field notes',
  DryGround: 'Dry ground',
  LeavesOnTrees: 'Leaves on trees',
  Muddy: 'Muddy',
  RainingSnowing: 'Raining or snowing',
  SnowIce: 'Snow or ice',
  StandingWater: 'Standing water',
}

export function label(column: string): string {
  if (LABELS[column]) return LABELS[column]
  return column
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

/** Single-letter MUC modifiers used by the GLOBE data entry site. */
const MUC_DETAIL: Record<string, string> = {
  b: 'Broad leaved',
  n: 'Needle leaved',
  c: 'Coniferous',
  l: 'Leafless / deciduous',
}

export function formatValue(column: string, value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  const text = String(value)

  if (text === 'true') return 'Yes'
  if (text === 'false') return 'No'

  if (column === 'MucDetails') return MUC_DETAIL[text] ?? text
  if (column === 'LocationAccuracyM') return `${text} m`
  if (column === 'Elevation' || column === 'MeasurementElevation') {
    const n = Number(text)
    return Number.isFinite(n) ? `${n.toFixed(1)} m` : text
  }
  if (column === 'MeasuredAt') return formatDateTime(text)
  if (column === 'MeasuredDate') return formatDate(text)
  if (column === 'GlobeTeams') return text.replace(/^\[|\]$/g, '').split(', ').join(' · ')

  return text
}

export function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // Many rows carry a midnight placeholder rather than a real observation time.
  const hasTime = !/T00:00:00(\.0+)?$/.test(value)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

export function formatCoordinate(lon: number, lat: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`
}

export const compactNumber = (n: number) => n.toLocaleString()

/** Day index since the epoch → Date, and back. */
export function dayToDate(epoch: string, day: number): Date {
  const base = new Date(`${epoch}T00:00:00`)
  base.setDate(base.getDate() + day)
  return base
}

export function dateToDay(epoch: string, date: Date): number {
  const base = new Date(`${epoch}T00:00:00`)
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((local.getTime() - base.getTime()) / 86_400_000)
}

/** Columns grouped into the sections the detail panel renders. */
export const ATTRIBUTE_SECTIONS: Array<{ title: string; columns: string[] }> = [
  {
    title: 'Observation',
    columns: ['MeasuredAt', 'DataSource'],
  },
  {
    title: 'Location',
    columns: [
      'CountryName',
      'CountryCode',
      'Elevation',
      'MeasurementElevation',
      'LocationAccuracyM',
      'LocationMethod',
    ],
  },
  // MucCode / MucDescription / MucDetails are rendered by the detail panel's
  // "Land cover classification" section, alongside the per-direction bars.
  {
    title: 'Surface conditions',
    columns: ['DryGround', 'Muddy', 'StandingWater', 'SnowIce', 'RainingSnowing', 'LeavesOnTrees'],
  },
]
