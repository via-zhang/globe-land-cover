import { EMPTY_FILTERS, type Country, type Filters, type Meta } from '../lib/types'
import { isActive } from '../lib/filters'
import CountryFilter from './CountryFilter'
import CoverFilter from './CoverFilter'
import DateFilter from './DateFilter'

interface Props {
  meta: Meta
  countries: Country[]
  calendar: Array<[number, number]>
  filters: Filters
  visible: number
  onChange: (next: Partial<Filters>) => void
  onReset: () => void
}

export default function FilterBar({
  meta,
  countries,
  calendar,
  filters,
  visible,
  onChange,
  onReset,
}: Props) {
  const active = isActive(filters)

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
      <div className="grain lit-edge pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-base/92 p-2 shadow-xl shadow-black/50 backdrop-blur-md">
        <h1 className="mr-2 hidden shrink-0 items-center gap-2 pl-1.5 lg:flex">
          <span className="h-3 w-0.5 rounded-full bg-leaf" aria-hidden />
          <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink uppercase">
            Globe Land Cover
          </span>
        </h1>

        <DateFilter meta={meta} filters={filters} onChange={onChange} calendar={calendar} />
        <CountryFilter countries={countries} filters={filters} onChange={onChange} />
        <CoverFilter meta={meta} filters={filters} onChange={onChange} />

        <button
          type="button"
          onClick={() => onChange({ photosOnly: !filters.photosOnly })}
          aria-pressed={filters.photosOnly}
          title={`${meta.withPhotos.toLocaleString()} observations have at least one direction photo`}
          className={`rounded-md border px-2.5 py-1.5 text-xs transition ${
            filters.photosOnly
              ? 'border-leaf/50 bg-leaf/10 text-leaf'
              : 'border-line bg-surface text-ink-muted hover:bg-raised'
          }`}
        >
          Has photos
        </button>

        <div className="ml-auto flex items-center gap-2 pr-1">
          <p className="font-mono text-[11px] whitespace-nowrap text-ink-muted">
            <span className={active ? 'text-leaf' : 'text-ink'}>{visible.toLocaleString()}</span>
            <span className="text-ink-faint"> / {meta.total.toLocaleString()}</span>
          </p>
          {active && (
            <button
              type="button"
              onClick={onReset}
              className="rounded border border-line px-2 py-1 text-[11px] text-ink-muted transition hover:border-leaf/40 hover:text-leaf"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {active && visible === 0 && (
        <p className="pointer-events-auto mt-2 inline-block rounded-md border border-line bg-base/92 px-3 py-2 text-xs text-ink-muted backdrop-blur-md">
          No observations match these filters.{' '}
          <button
            type="button"
            onClick={onReset}
            className="text-leaf underline underline-offset-2"
          >
            Reset
          </button>
        </p>
      )}
    </div>
  )
}

export { EMPTY_FILTERS }
