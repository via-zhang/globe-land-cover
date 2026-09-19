import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DetailPanel from './components/DetailPanel'
import FilterBar from './components/FilterBar'
import MapView from './components/MapView'
import { loadBootstrap, toGeoJSON, type Bootstrap } from './lib/data'
import { countMatching, matchesFilters, toMapFilter } from './lib/filters'
import { useMediaQuery } from './lib/useMediaQuery'
import MapLegend from './components/MapLegend'
import MobileSheet from './components/MobileSheet'
import { EMPTY_FILTERS, type ColorMode, type Filters, type Projection } from './lib/types'

function readUrl(): { fid: number | null; filters: Filters } {
  const params = new URLSearchParams(window.location.search)
  const int = (key: string) => {
    const value = params.get(key)
    if (value === null) return null
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    fid: int('fid'),
    filters: {
      from: int('from'),
      to: int('to'),
      country: params.get('country'),
      cover:
        params
          .get('cover')
          ?.split(',')
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 7) ?? [],
      includeUnclassified: params.get('unclassified') !== '0',
      photosOnly: params.get('photos') === '1',
    },
  }
}

function writeUrl(fid: number | null, filters: Filters) {
  const params = new URLSearchParams()
  if (fid !== null) params.set('fid', String(fid))
  if (filters.from !== null) params.set('from', String(filters.from))
  if (filters.to !== null) params.set('to', String(filters.to))
  if (filters.country) params.set('country', filters.country)
  if (filters.cover.length > 0) params.set('cover', filters.cover.join(','))
  if (!filters.includeUnclassified) params.set('unclassified', '0')
  if (filters.photosOnly) params.set('photos', '1')
  const query = params.toString()
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
}

export default function App() {
  const initial = useRef(readUrl())
  const [data, setData] = useState<Bootstrap | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(initial.current.filters)
  const [selectedFid, setSelectedFid] = useState<number | null>(initial.current.fid)
  const [fitBounds, setFitBounds] = useState<[number, number, number, number] | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('uniform')
  const [projection, setProjection] = useState<Projection>('globe')
  const wide = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    loadBootstrap()
      .then(setData)
      .catch((cause: unknown) =>
        setLoadError(cause instanceof Error ? cause.message : 'Could not load data'),
      )
  }, [])

  useEffect(() => {
    writeUrl(selectedFid, filters)
  }, [selectedFid, filters])

  const geojson = useMemo(() => (data ? toGeoJSON(data.points) : null), [data])
  const mapFilter = useMemo(
    () => (data ? toMapFilter(filters, data.countries) : null),
    [filters, data],
  )
  const visible = useMemo(
    () => (data ? countMatching(data.points, filters, data.countries) : 0),
    [data, filters],
  )

  // fid values are contiguous from 1, but map explicitly rather than assume it.
  const indexByFid = useMemo(() => {
    if (!data) return null
    const map = new Map<number, number>()
    data.points.fid.forEach((fid, index) => map.set(fid, index))
    return map
  }, [data])

  const outsideFilters = useMemo(() => {
    if (!data || !indexByFid || selectedFid === null) return false
    const index = indexByFid.get(selectedFid)
    if (index === undefined) return false
    return !matchesFilters(index, data.points, filters, data.countries)
  }, [data, indexByFid, selectedFid, filters])

  const updateFilters = useCallback(
    (next: Partial<Filters>) => {
      setFilters((current) => {
        const merged = { ...current, ...next }
        if (next.country !== undefined && next.country !== current.country && data) {
          const country = data.countries.find((entry) => entry.code === next.country)
          if (country?.bbox) setFitBounds(country.bbox)
        }
        return merged
      })
    },
    [data],
  )

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const handleSelect = useCallback((fid: number) => {
    setSelectedFid(fid)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedFid !== null) setSelectedFid(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedFid])

  if (loadError) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-ink">Could not load the data files</h1>
          <p className="mt-2 text-sm text-ink-muted">{loadError}</p>
          <p className="mt-4 text-xs text-ink-faint">
            Run <code className="rounded bg-raised px-1 py-0.5 font-mono">npm run data</code> to
            generate <code className="font-mono">public/data</code> from the GeoPackage, then
            reload.
          </p>
        </div>
      </div>
    )
  }

  if (!data || !geojson || !mapFilter) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-leaf" />
          Loading observations…
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <main className="relative min-h-0 flex-1">
        <MapView
          points={geojson}
          outlines={data.outlines}
          filter={mapFilter}
          selectedFid={selectedFid}
          fitBounds={fitBounds}
          colorMode={colorMode}
          coverGroups={data.meta.coverGroups}
          projection={projection}
          onSelect={handleSelect}
        />
        <MapLegend
          meta={data.meta}
          mode={colorMode}
          onChange={setColorMode}
          projection={projection}
          onProjectionChange={setProjection}
        />
        <FilterBar
          meta={data.meta}
          countries={data.countries}
          calendar={data.calendar}
          filters={filters}
          visible={visible}
          onChange={updateFilters}
          onReset={reset}
        />
      </main>

      {selectedFid !== null &&
        (wide ? (
          /* Wide screens: a fixed rail beside the map. */
          <aside className="w-[30rem] shrink-0 border-l border-line xl:w-[34rem]">
            <DetailPanel
              fid={selectedFid}
              meta={data.meta}
              outlines={data.outlines}
              outsideFilters={outsideFilters}
              onClose={() => setSelectedFid(null)}
            />
          </aside>
        ) : (
          /* Narrow screens: a sheet over the map, draggable between heights. */
          <MobileSheet onClose={() => setSelectedFid(null)}>
            <DetailPanel
              fid={selectedFid}
              meta={data.meta}
              outlines={data.outlines}
              outsideFilters={outsideFilters}
              onClose={() => setSelectedFid(null)}
            />
          </MobileSheet>
        ))}
    </div>
  )
}
