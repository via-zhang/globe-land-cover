import { useMemo } from 'react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const addMonths = (date: Date, count: number) =>
  new Date(date.getFullYear(), date.getMonth() + count, 1)
const sameDay = (a: Date | null, b: Date | null) =>
  Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate())

interface Props {
  month: Date
  onMonthChange: (month: Date) => void
  /** Selected range start, or null. */
  from: Date | null
  /** Selected range end. Null means the range runs to `today`. */
  to: Date | null
  today: Date
  min: Date
  max: Date
  onPick: (date: Date) => void
  /** 0 (none) to 3 (busiest) — shades the cell behind the day. */
  density: (date: Date) => number
}

/**
 * A month grid with an observation-density heatmap behind the days.
 *
 * Hand-rolled rather than pulled from a library: the selection model here is
 * unusual (one click means "this date onward"), and the cells carry a density
 * shade underneath the range highlight.
 */
export default function Calendar({
  month,
  onMonthChange,
  from,
  to,
  today,
  min,
  max,
  onPick,
  density,
}: Props) {
  const cells = useMemo(() => {
    const first = startOfMonth(month)
    const lead = first.getDay()
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const list: Array<Date | null> = Array.from({ length: lead }, () => null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      list.push(new Date(month.getFullYear(), month.getMonth(), day))
    }
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [month])

  const rangeEnd = to ?? (from ? today : null)
  const canPrev = startOfMonth(month) > startOfMonth(min)
  const canNext = startOfMonth(month) < startOfMonth(max)

  const shades = ['', 'bg-leaf/[0.08]', 'bg-leaf/[0.18]', 'bg-leaf/30']

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
          className="grid h-6 w-6 place-items-center rounded border border-line text-ink-muted transition enabled:hover:border-leaf/40 enabled:hover:text-leaf disabled:opacity-25"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <p className="text-[13px] font-medium text-ink">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
          className="grid h-6 w-6 place-items-center rounded border border-line text-ink-muted transition enabled:hover:border-leaf/40 enabled:hover:text-leaf disabled:opacity-25"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((day, index) => (
          <div
            key={index}
            className="pb-1 text-center font-mono text-[9px] tracking-widest text-ink-faint uppercase"
          >
            {day}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) return <div key={index} />

          const disabled = date < min || date > max
          const isStart = sameDay(date, from)
          const isEnd = to ? sameDay(date, to) : false
          const inside = Boolean(from && rangeEnd && date > from && date < rangeEnd)
          const openTail = Boolean(from && !to && date > from && date <= today)
          const shade = shades[density(date)]

          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={() => onPick(date)}
              aria-label={date.toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              aria-pressed={isStart || isEnd}
              className={`relative h-8 font-mono text-[11px] transition disabled:opacity-20 ${
                isStart || isEnd
                  ? 'z-10 rounded bg-leaf font-semibold text-black'
                  : inside
                    ? 'bg-leaf/25 text-ink'
                    : openTail
                      ? `bg-leaf/12 text-ink ${shade}`
                      : `rounded text-ink enabled:hover:bg-raised ${shade}`
              } ${sameDay(date, today) && !isStart && !isEnd ? 'font-semibold text-leaf' : ''}`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
