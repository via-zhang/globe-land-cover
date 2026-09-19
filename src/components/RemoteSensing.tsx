import { useEffect, useState } from 'react'
import { loadChips, type Chip } from '../lib/planetary'
import { Section, Spinner } from './ui'

interface Props {
  fid: number
  lon: number
  lat: number
  measuredDate: string
}

/**
 * Satellite context for the 1 km square around the observation, from the
 * Planetary Computer. Results are cached per observation so re-selecting a
 * point on the map costs nothing.
 */
const cache = new Map<number, Chip[]>()

export default function RemoteSensing({ fid, lon, lat, measuredDate }: Props) {
  const [chips, setChips] = useState<Chip[] | null>(() => cache.get(fid) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = cache.get(fid)
    if (cached) {
      setChips(cached)
      setError(null)
      return
    }

    const controller = new AbortController()
    setChips(null)
    setError(null)

    loadChips(lon, lat, measuredDate, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        cache.set(fid, result)
        setChips(result)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Request failed')
      })

    return () => controller.abort()
  }, [fid, lon, lat, measuredDate])

  if (error) {
    return (
      <Section title="Satellite context · 1 km">
        <div className="rounded border border-line bg-raised p-3 text-xs text-ink-muted">
          Could not reach the Planetary Computer ({error}). It is rate limited
          and offers no uptime guarantee — try this observation again shortly.
        </div>
      </Section>
    )
  }

  if (!chips) {
    return (
      <Section title="Satellite context · 1 km">
        <div className="space-y-2">
          <Spinner label="Searching satellite archives…" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="aspect-square animate-pulse rounded bg-raised" />
            ))}
          </div>
        </div>
      </Section>
    )
  }

  // Layers with no coverage here are dropped rather than shown as placeholders;
  // if nothing covers the point at all, the section does not appear.
  const covered = chips.filter((chip) => chip.imageUrl !== null)
  if (covered.length === 0) return null

  return (
    <Section title="Satellite context · 1 km">
      <div className="grid grid-cols-2 gap-2">
        {covered.map((chip) => (
          <figure key={chip.key} className="min-w-0">
            <img
              src={chip.imageUrl!}
              alt={`${chip.title} covering one square kilometre around the observation`}
              loading="lazy"
              className="aspect-square w-full rounded border border-line bg-raised object-cover"
            />
            <figcaption className="mt-1.5">
              <p className="truncate text-[11px] font-medium text-ink" title={chip.title}>
                {chip.title}
              </p>
              {chip.date && (
                <p className="font-mono text-[9.5px] tracking-wide text-ink-faint">{chip.date}</p>
              )}
              {chip.note && (
                <p className="font-mono text-[9.5px] tracking-wide text-ink-faint">{chip.note}</p>
              )}
              {/* Amber marks a value measured from orbit, against the green of
                  everything recorded on the ground. */}
              {chip.readout && (
                <p className="mt-1 font-mono text-[10px] text-orbit">
                  {chip.readout.value}
                  <span className="ml-1 text-ink-faint">{chip.readout.label}</span>
                </p>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Each tile covers 1 km × 1 km centered on the observation, accessed via
        Microsoft Planetary Computer.
      </p>
    </Section>
  )
}
