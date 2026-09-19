import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import type { Country, Filters, PointIndex } from './types'

/**
 * Translate the filter state into a MapLibre expression.
 *
 * Every filter runs in the style layer rather than by rebuilding the source,
 * so changing a date or a cover chip costs one setFilter call on 60,791
 * features instead of a re-parse.
 */
export function toMapFilter(filters: Filters, countries: Country[]): FilterSpecification {
  const clauses: ExpressionSpecification[] = []

  if (filters.from !== null) clauses.push(['>=', ['get', 'd'], filters.from])
  if (filters.to !== null) clauses.push(['<=', ['get', 'd'], filters.to])

  if (filters.country) {
    const index = countries.findIndex((country) => country.code === filters.country)
    // An unknown code must match nothing rather than everything.
    clauses.push(['==', ['get', 'cc'], index < 0 ? -1 : index])
  }

  if (filters.photosOnly) clauses.push(['>', ['get', 'pc'], 0])

  if (filters.cover.length > 0) {
    const groups: ExpressionSpecification[] = filters.cover.map(
      (id) => ['get', `lc${id}`] as ExpressionSpecification,
    )
    if (filters.includeUnclassified) groups.push(['get', 'un'])
    clauses.push(['any', ...groups])
  } else if (!filters.includeUnclassified) {
    clauses.push(['!', ['get', 'un']])
  }

  if (clauses.length === 0) return true as unknown as FilterSpecification
  return ['all', ...clauses] as FilterSpecification
}

/** Same predicate as the map filter, for the "showing N of M" counter. */
export function countMatching(
  points: PointIndex,
  filters: Filters,
  countries: Country[],
): number {
  const countryIndex = filters.country
    ? countries.findIndex((country) => country.code === filters.country)
    : -1
  if (filters.country && countryIndex < 0) return 0

  const cover = filters.cover
  let total = 0

  for (let i = 0; i < points.fid.length; i += 1) {
    if (filters.from !== null && points.d[i] < filters.from) continue
    if (filters.to !== null && points.d[i] > filters.to) continue
    if (filters.country && points.cc[i] !== countryIndex) continue
    if (filters.photosOnly && points.pc[i] === 0) continue

    const groups = points.lc[i]
    if (cover.length > 0) {
      const matches =
        cover.some((id) => groups.includes(id)) ||
        (filters.includeUnclassified && groups.length === 0)
      if (!matches) continue
    } else if (!filters.includeUnclassified && groups.length === 0) {
      continue
    }
    total += 1
  }
  return total
}

export function isActive(filters: Filters): boolean {
  return (
    filters.from !== null ||
    filters.to !== null ||
    filters.country !== null ||
    filters.cover.length > 0 ||
    !filters.includeUnclassified ||
    filters.photosOnly
  )
}

/** Does this observation survive the current filters? */
export function matchesFilters(
  index: number,
  points: PointIndex,
  filters: Filters,
  countries: Country[],
): boolean {
  if (filters.from !== null && points.d[index] < filters.from) return false
  if (filters.to !== null && points.d[index] > filters.to) return false
  if (filters.country) {
    const countryIndex = countries.findIndex((country) => country.code === filters.country)
    if (points.cc[index] !== countryIndex) return false
  }
  if (filters.photosOnly && points.pc[index] === 0) return false

  const groups = points.lc[index]
  if (filters.cover.length > 0) {
    return (
      filters.cover.some((id) => groups.includes(id)) ||
      (filters.includeUnclassified && groups.length === 0)
    )
  }
  return filters.includeUnclassified || groups.length > 0
}
