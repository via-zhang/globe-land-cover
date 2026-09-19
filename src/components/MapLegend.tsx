import type { ColorMode, Meta } from '../lib/types'

interface Props {
  meta: Meta
  mode: ColorMode
  onChange: (mode: ColorMode) => void
}

/** Switches the point colouring, and explains it when it means something. */
export default function MapLegend({ meta, mode, onChange }: Props) {
  const modes: Array<{ id: ColorMode; label: string }> = [
    { id: 'uniform', label: 'Uniform' },
    { id: 'cover', label: 'Land cover' },
  ]

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 max-w-[15rem]">
      <div className="grain lit-edge rounded-lg border border-line bg-base/92 p-2 shadow-xl shadow-black/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.16em] text-ink-faint uppercase">
            Color
          </span>
          <span className="tick-rule h-px flex-1" aria-hidden />
          <div className="flex gap-0.5" role="group" aria-label="Point coloring">
            {modes.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                aria-pressed={mode === option.id}
                className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] tracking-wider uppercase transition ${
                  mode === option.id
                    ? 'bg-leaf/15 text-leaf'
                    : 'text-ink-faint hover:text-ink-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'cover' && (
          <ul className="mt-2 space-y-1">
            {meta.coverGroups.map((group) => (
              <li key={group.id} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: group.color }}
                  aria-hidden
                />
                <span className="truncate font-mono text-[9.5px] text-ink-muted">
                  {group.label}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-1.5 border-t border-line-soft pt-1">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: '#64748b' }}
                aria-hidden
              />
              <span className="truncate font-mono text-[9.5px] text-ink-faint">
                Unclassified
              </span>
              <span className="ml-auto font-mono text-[9px] text-ink-faint">
                {Math.round((meta.unclassified / meta.total) * 100)}%
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
