import type { Filters, Meta } from '../lib/types'
import { Popover } from './ui'

interface Props {
  meta: Meta
  filters: Filters
  onChange: (next: Partial<Filters>) => void
}

export default function CoverFilter({ meta, filters, onChange }: Props) {
  const toggle = (id: number) => {
    const next = filters.cover.includes(id)
      ? filters.cover.filter((value) => value !== id)
      : [...filters.cover, id]
    onChange({ cover: next })
  }

  const summary = (() => {
    if (filters.cover.length === 0) {
      return filters.includeUnclassified ? 'All types' : 'Classified only'
    }
    if (filters.cover.length === 1) {
      return meta.coverGroups.find((group) => group.id === filters.cover[0])?.label ?? '1 type'
    }
    return `${filters.cover.length} types`
  })()

  const active = filters.cover.length > 0 || !filters.includeUnclassified

  return (
    <Popover label="Land cover" summary={summary} active={active} width="w-[20rem]">
      {() => (
        <div>
          <ul className="space-y-0.5">
            {meta.coverGroups.map((group) => {
              const checked = filters.cover.includes(group.id)
              const count = meta.coverCounts[String(group.id)] ?? 0
              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-pressed={checked}
                    className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-xs transition ${
                      checked ? 'bg-raised text-ink' : 'text-ink-muted hover:bg-raised/60'
                    }`}
                  >
                    <span
                      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border transition ${
                        checked ? 'border-transparent' : 'border-line'
                      }`}
                      style={checked ? { background: group.color } : undefined}
                    >
                      {checked && (
                        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-black" aria-hidden>
                          <path
                            d="M1.5 5.2 3.8 7.5 8.5 2.8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: group.color }}
                      aria-hidden
                    />
                    <span className="truncate">{group.label}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                      {count.toLocaleString()}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <label className="mt-2 flex cursor-pointer items-center gap-2.5 rounded border-t border-line-soft px-2 pt-3 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={filters.includeUnclassified}
              onChange={(event) => onChange({ includeUnclassified: event.target.checked })}
              className="h-3.5 w-3.5 accent-[#86efac]"
            />
            <span>Include unclassified</span>
            <span className="ml-auto font-mono text-[10px] text-ink-faint">
              {meta.unclassified.toLocaleString()}
            </span>
          </label>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {meta.unclassified.toLocaleString()} of {meta.total.toLocaleString()} observations
            carry no land cover classification. They stay on the map unless you
            uncheck them. A site matches every type its photos were classified
            as, so the counts overlap.
          </p>

          {(filters.cover.length > 0 || !filters.includeUnclassified) && (
            <button
              type="button"
              onClick={() => onChange({ cover: [], includeUnclassified: true })}
              className="mt-2 w-full rounded border border-line py-1.5 text-[11px] text-ink-muted transition hover:border-leaf/40 hover:text-leaf"
            >
              Clear land cover
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
