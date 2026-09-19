import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** A filter-bar trigger plus the panel it opens. Closes on outside click or Escape. */
export function Popover({
  label,
  summary,
  active,
  children,
  align = 'left',
  width = 'w-[20rem]',
}: {
  label: string
  summary: string
  active: boolean
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex max-w-[15rem] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
          active
            ? 'border-leaf/50 bg-leaf/10 text-leaf'
            : 'border-line bg-surface text-ink hover:border-line/80 hover:bg-raised'
        }`}
      >
        <span className="shrink-0 font-medium">{label}</span>
        <span className={`truncate ${active ? 'text-leaf/80' : 'text-ink-muted'}`}>{summary}</span>
        <svg viewBox="0 0 12 12" className="ml-auto h-3 w-3 shrink-0 opacity-60" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className={`absolute z-30 mt-1.5 ${width} max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-3 shadow-2xl shadow-black/60 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

const SECTION_TITLE =
  'font-mono text-[10px] font-medium tracking-[0.16em] text-ink-muted uppercase whitespace-nowrap'

/** The index mark that opens every section header, like a gauge label. */
function Tick() {
  return <span className="h-2.5 w-0.5 shrink-0 rounded-full bg-leaf/45" aria-hidden />
}

export function Section({
  title,
  children,
  action,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  collapsible?: boolean
  /** Only consulted when `collapsible`. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const expanded = !collapsible || open

  return (
    <section className="border-t border-line-soft px-4 py-4 first:border-t-0">
      <header className="flex items-center gap-2.5">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="group flex min-w-0 items-center gap-2 text-left"
          >
            <svg
              viewBox="0 0 12 12"
              aria-hidden
              className={`h-3 w-3 shrink-0 text-leaf/60 transition-transform ${
                open ? 'rotate-90' : ''
              }`}
            >
              <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <h3 className={`${SECTION_TITLE} transition group-hover:text-ink`}>{title}</h3>
          </button>
        ) : (
          <>
            <Tick />
            <h3 className={SECTION_TITLE}>{title}</h3>
          </>
        )}
        {/* Rule runs out to the action, giving each header a measured baseline. */}
        <span className="tick-rule h-px min-w-4 flex-1" aria-hidden />
        {action}
      </header>
      {/* Collapsed content is unmounted, so its photos are not fetched until opened. */}
      {expanded && (
        <div id={bodyId} className="mt-2.5">
          {children}
        </div>
      )}
    </section>
  )
}

/** A labelled readout. Values are monospaced so columns line up like a gauge. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9.5px] tracking-[0.13em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[12px] break-words text-ink">{value}</dd>
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'yes' | 'no'
}) {
  const tones = {
    neutral: 'border-line bg-raised text-ink-muted',
    yes: 'border-leaf/40 bg-leaf/10 text-leaf',
    no: 'border-line bg-surface text-ink-faint',
  }
  return (
    <span
      className={`inline-flex rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-leaf" />
      {label}
    </div>
  )
}
