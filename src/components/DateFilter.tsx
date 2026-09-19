import { useMemo, useState } from 'react'
import { dateToDay, dayToDate } from '../lib/format'
import type { Filters, Meta } from '../lib/types'
import Calendar from './Calendar'
import { Popover } from './ui'

/**
 * One click sets the start and filters that date through today. A second
 * click closes the range. A third starts over.
 */
interface Props {
  meta: Meta
  filters: Filters
  onChange: (next: Partial<Filters>) => void
  calendar: Array<[number, number]>
}

const short = (date: Date) =>
  date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function DateFilter({ meta, filters, onChange, calendar }: Props) {
  const today = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }, [])

  const dataStart = useMemo(() => dayToDate(meta.epoch, meta.dayRange[0]), [meta])
  const dataEnd = useMemo(() => dayToDate(meta.epoch, meta.dayRange[1]), [meta])

  const [month, setMonth] = useState<Date>(
    () => new Date(dataEnd.getFullYear(), dataEnd.getMonth(), 1),
  )

  // Observations per day, bucketed for the heatmap behind the calendar.
  const counts = useMemo(() => new Map(calendar), [calendar])
  const busiest = useMemo(
    () => calendar.reduce((max, [, count]) => Math.max(max, count), 1),
    [calendar],
  )
  const density = (date: Date): number => {
    const count = counts.get(dateToDay(meta.epoch, date)) ?? 0
    if (count === 0) return 0
    const share = count / busiest
    if (share > 0.2) return 3
    if (share > 0.05) return 2
    return 1
  }

  const from = filters.from === null ? null : dayToDate(meta.epoch, filters.from)
  const to = filters.to === null ? null : dayToDate(meta.epoch, filters.to)

  const pick = (day: Date) => {
    const index = dateToDay(meta.epoch, day)
    // A closed range, or none at all, means this click starts a new one.
    if (filters.from === null || filters.to !== null) {
      onChange({ from: index, to: null })
      return
    }
    if (index < filters.from) onChange({ from: index, to: filters.from })
    else onChange({ from: filters.from, to: index })
  }

  const summary = (() => {
    if (from && to) return `${short(from)} – ${short(to)}`
    if (from) return `${short(from)} → today`
    return 'All dates'
  })()

  const presets: Array<{ label: string; from: number | null; to: number | null }> = [
    { label: 'All dates', from: null, to: null },
    {
      label: 'Last 12 months',
      from: dateToDay(
        meta.epoch,
        new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()),
      ),
      to: null,
    },
    {
      label: '2025',
      from: dateToDay(meta.epoch, new Date(2025, 0, 1)),
      to: dateToDay(meta.epoch, new Date(2025, 11, 31)),
    },
    {
      label: '2024',
      from: dateToDay(meta.epoch, new Date(2024, 0, 1)),
      to: dateToDay(meta.epoch, new Date(2024, 11, 31)),
    },
  ]

  return (
    <Popover
      label="Date"
      summary={summary}
      active={filters.from !== null || filters.to !== null}
      width="w-[19rem]"
    >
      {() => (
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onChange({ from: preset.from, to: preset.to })
                  if (preset.from !== null) {
                    const target = dayToDate(meta.epoch, preset.from)
                    setMonth(new Date(target.getFullYear(), target.getMonth(), 1))
                  }
                }}
                className="rounded border border-line bg-raised px-2 py-1 text-[11px] text-ink-muted transition hover:border-leaf/40 hover:text-leaf"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <Calendar
            month={month}
            onMonthChange={setMonth}
            from={from}
            to={to}
            today={today}
            min={dataStart}
            max={today}
            onPick={pick}
            density={density}
          />

          <p className="mt-2 border-t border-line-soft pt-2 text-[11px] leading-relaxed text-ink-faint">
            {from && !to ? (
              <>Showing {short(from)} onward. Click a second date to close the range.</>
            ) : (
              <>Click a date to filter from then to today. Click a second for a range.</>
            )}
            <br />
            Shading shows how many observations fall on each day. Records run{' '}
            {short(dataStart)} – {short(dataEnd)}.
          </p>

          {(filters.from !== null || filters.to !== null) && (
            <button
              type="button"
              onClick={() => onChange({ from: null, to: null })}
              className="mt-2 w-full rounded border border-line py-1.5 text-[11px] text-ink-muted transition hover:border-leaf/40 hover:text-leaf"
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
