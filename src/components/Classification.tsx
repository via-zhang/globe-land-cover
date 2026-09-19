import { formatValue } from '../lib/format'
import {
  DIRECTION_LABEL,
  groupColor,
  parseClassifications,
  type Direction,
} from '../lib/observation'
import type { Observation } from '../lib/types'
import { Section } from './ui'

const HORIZONTAL: Direction[] = ['North', 'East', 'South', 'West']

/**
 * Land cover classification: the site-level MUC code first, then the
 * per-direction breakdown beneath it.
 *
 * Both describe the same thing at different resolutions, so they share one
 * section — the site code is the headline and the bars are its detail.
 *
 * The classification strings look like
 *   "70% MUC 12 (n) [Trees, Loosely Spaced, Deciduous - Needle Leaved]; 60% ..."
 * Percentages are independent visual estimates per direction, so they do not
 * sum to 100 — each bar is scaled to whatever that direction recorded.
 */
export default function Classification({ observation }: { observation: Observation }) {
  const rows = HORIZONTAL.map((direction) => ({
    direction,
    entries: parseClassifications(observation[`${direction}Classifications`]),
  })).filter((row) => row.entries.length > 0)

  const site = observation.MucDescription
  if (site === undefined && rows.length === 0) return null

  return (
    <Section title="Land cover classification">
      {site !== undefined && (
        <div className={rows.length > 0 ? 'mb-4 border-b border-line-soft pb-3' : undefined}>
          <p className="text-[13px] text-ink">{String(site)}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-faint">
            MUC {String(observation.MucCode ?? '—')}
            {observation.MucDetails !== undefined
              ? ` · ${formatValue('MucDetails', observation.MucDetails)}`
              : ''}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map(({ direction, entries }) => {
            const total = entries.reduce((sum, entry) => sum + entry.percent, 0)
            return (
              <div key={direction}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-ink-muted">
                    {DIRECTION_LABEL[direction]}
                  </span>
                  <span className="font-mono text-[10px] text-ink-faint">
                    {entries.length} class{entries.length === 1 ? '' : 'es'}
                  </span>
                </div>

                <div className="flex h-2 overflow-hidden rounded-full bg-raised">
                  {entries.map((entry, index) => (
                    <span
                      key={`${entry.code}-${index}`}
                      className="h-full"
                      style={{
                        width: `${(entry.percent / total) * 100}%`,
                        background: groupColor(entry.group),
                      }}
                      title={`${entry.percent}% · MUC ${entry.code} · ${entry.label}`}
                    />
                  ))}
                </div>

                <ul className="mt-1.5 space-y-0.5">
                  {entries.map((entry, index) => (
                    <li
                      key={`${entry.code}-${index}`}
                      className="flex items-baseline gap-1.5 text-[11px]"
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: groupColor(entry.group) }}
                        aria-hidden
                      />
                      <span className="shrink-0 font-mono text-ink-muted">{entry.percent}%</span>
                      <span className="min-w-0 text-ink">{entry.label}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-faint">
                        MUC {entry.code}
                        {entry.modifier ? ` (${entry.modifier})` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
