import { useMemo, useState } from 'react'
import type { Country, Filters } from '../lib/types'
import { Popover } from './ui'

interface Props {
  countries: Country[]
  filters: Filters
  onChange: (next: Partial<Filters>) => void
}

export default function CountryFilter({ countries, filters, onChange }: Props) {
  const [query, setQuery] = useState('')

  const selected = countries.find((country) => country.code === filters.country) ?? null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return countries
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(needle) ||
        country.code.toLowerCase().includes(needle),
    )
  }, [countries, query])

  return (
    <Popover
      label="Country"
      summary={selected ? selected.name : 'Anywhere'}
      active={filters.country !== null}
      width="w-[18rem]"
    >
      {(close) => (
        <div>
          <input
            type="search"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${countries.length} countries…`}
            className="w-full rounded border border-line bg-base px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-leaf/50 focus:outline-none"
          />

          {filters.country && (
            <button
              type="button"
              onClick={() => {
                onChange({ country: null })
                close()
              }}
              className="mt-2 w-full rounded border border-line py-1.5 text-[11px] text-ink-muted transition hover:border-leaf/40 hover:text-leaf"
            >
              Clear country
            </button>
          )}

          <ul className="mt-2 max-h-64 overflow-y-auto">
            {matches.map((country) => {
              const isSelected = country.code === filters.country
              return (
                <li key={country.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ country: isSelected ? null : country.code })
                      close()
                    }}
                    className={`flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                      isSelected ? 'bg-leaf/15 text-leaf' : 'text-ink hover:bg-raised'
                    }`}
                  >
                    <span className="truncate">{country.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                      {country.count.toLocaleString()}
                    </span>
                  </button>
                </li>
              )
            })}
            {matches.length === 0 && (
              <li className="px-2 py-3 text-center text-[11px] text-ink-faint">No match</li>
            )}
          </ul>

          <p className="mt-2 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-ink-faint">
            Selecting a country zooms to its borders. Country comes from the
            observation record, which is registration-based — a few sites sit
            outside the country they are filed under.
          </p>
        </div>
      )}
    </Popover>
  )
}
