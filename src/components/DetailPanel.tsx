import { useEffect, useMemo, useState } from 'react'
import { loadObservation } from '../lib/data'
import { formatCoordinate, formatDate } from '../lib/format'
import { directionPhotos, featurePhotos, DIRECTIONS } from '../lib/observation'
import type { Meta, Observation } from '../lib/types'
import Attributes from './Attributes'
import Classification from './Classification'
import LocatorGlobe from './LocatorGlobe'
import PanoramaViewer from './PanoramaViewer'
import PhotoGrid from './PhotoGrid'
import RemoteSensing from './RemoteSensing'
import { Section, Spinner } from './ui'

interface Props {
  fid: number
  meta: Meta
  outlines: GeoJSON.FeatureCollection
  outsideFilters: boolean
  onClose: () => void
}

export default function DetailPanel({ fid, meta, outlines, outsideFilters, onClose }: Props) {
  const [observation, setObservation] = useState<Observation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setObservation(null)
    setError(null)
    loadObservation(fid, meta.shardSize)
      .then((record) => {
        if (!live) return
        if (record) setObservation(record)
        else setError(`Observation ${fid} is not in the data files.`)
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not load observation')
      })
    return () => {
      live = false
    }
  }, [fid, meta.shardSize])

  const photos = useMemo(
    () => (observation ? directionPhotos(observation) : null),
    [observation],
  )
  const available = photos ? DIRECTIONS.filter((d) => photos[d] !== null).length : 0
  const features = observation ? featurePhotos(observation) : []

  const captions = useMemo(() => {
    if (!observation) return {}
    return Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, observation[`${direction}Caption`]]).filter(
        ([, caption]) => typeof caption === 'string',
      ),
    ) as Record<string, string>
  }, [observation])

  return (
    <div className="grain flex h-full flex-col bg-surface">
      <header className="lit-edge flex items-start gap-3 border-b border-line bg-raised/40 px-4 pt-3 pb-3.5">
        {observation && (
          <LocatorGlobe lon={observation.lon} lat={observation.lat} outlines={outlines} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.18em] text-ink-faint uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-leaf/70" aria-hidden />
            GLOBE observation
          </p>
          <h2 className="mt-1.5 truncate text-[19px] leading-none font-semibold tracking-tight text-ink">
            {observation ? formatDate(String(observation.MeasuredDate)) : '…'}
          </h2>
          {observation && (
            <p className="mt-1.5 truncate font-mono text-[11px] tracking-tight text-ink-muted">
              {formatCoordinate(observation.lon, observation.lat)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close observation details"
          className="shrink-0 rounded-sm border border-line px-2 py-1 font-mono text-[10px] tracking-widest text-ink-muted uppercase transition hover:border-leaf/40 hover:text-leaf"
        >
          Close
        </button>
      </header>

      {outsideFilters && (
        <p className="border-b border-line bg-raised px-4 py-2 text-[11px] text-ink-muted">
          This observation is hidden by the current filters.
        </p>
      )}

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        {error && <p className="px-4 py-6 text-sm text-ink-muted">{error}</p>}

        {!observation && !error && (
          <div className="px-4 py-6">
            <Spinner label="Loading observation…" />
          </div>
        )}

        {observation && photos && (
          <>
            {available > 0 && (
              <Section
                title="360° view"
                action={
                  <span className="font-mono text-[10px] text-ink-faint">
                    {available}/6 photos
                  </span>
                }
              >
                <PanoramaViewer photos={photos} observationId={fid} />
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Drag to look around, scroll to zoom, arrow keys to pan.
                </p>
              </Section>
            )}

            {available > 0 && (
              <Section
                title="Direction photos"
                collapsible
                defaultOpen={false}
                action={
                  <span className="font-mono text-[10px] text-ink-faint">
                    {available}/6
                  </span>
                }
              >
                <PhotoGrid photos={photos} captions={captions} />
              </Section>
            )}

            <RemoteSensing
              fid={fid}
              lon={observation.lon}
              lat={observation.lat}
              measuredDate={String(observation.MeasuredDate)}
            />

            <Classification observation={observation} />

            {features.length > 0 && (
              <Section title="Feature photos">
                <ul className="grid grid-cols-2 gap-1.5">
                  {features.map((photo, index) => (
                    <li key={photo.url}>
                      <a href={photo.url} target="_blank" rel="noreferrer noopener">
                        <img
                          src={photo.url}
                          alt={photo.caption ?? `Feature photo ${index + 1}`}
                          loading="lazy"
                          className="aspect-[4/3] w-full rounded border border-line bg-raised object-cover"
                        />
                      </a>
                      {photo.caption && (
                        <p className="mt-1 text-[11px] text-ink-muted">{photo.caption}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Attributes observation={observation} />
          </>
        )}
      </div>
    </div>
  )
}
