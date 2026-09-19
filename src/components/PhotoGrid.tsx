import { useState } from 'react'
import { DIRECTION_LABEL, DIRECTIONS, type Direction } from '../lib/observation'

interface Props {
  photos: Record<Direction, string | null>
  captions?: Partial<Record<Direction, string>>
}

/**
 * Flat contact sheet of the six directions. Shown under the 360° view, and on
 * its own for the 1,000-odd observations with only a photo or two, where a
 * cube would be almost entirely grey.
 */
export default function PhotoGrid({ photos, captions }: Props) {
  const [lightbox, setLightbox] = useState<Direction | null>(null)

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5">
        {DIRECTIONS.map((direction) => {
          const url = photos[direction]
          return (
            <li key={direction}>
              {url ? (
                <button
                  type="button"
                  onClick={() => setLightbox(direction)}
                  className="group relative block w-full overflow-hidden rounded border border-line"
                >
                  <img
                    src={url}
                    alt={`View facing ${DIRECTION_LABEL[direction]} from the observation site`}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-raised object-cover transition group-hover:opacity-85"
                  />
                  <span className="absolute bottom-0 left-0 bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                    {DIRECTION_LABEL[direction]}
                  </span>
                </button>
              ) : (
                <div
                  className="relative flex aspect-[4/3] w-full items-center justify-center rounded border border-line"
                  style={{ background: '#c3c9d1' }}
                >
                  <span className="text-[10px] font-medium text-[#6b7280]">No photo</span>
                  <span className="absolute bottom-0 left-0 bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {DIRECTION_LABEL[direction]}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {lightbox && photos[lightbox] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${DIRECTION_LABEL[lightbox]} photo`}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <figure className="max-h-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
            <img
              src={photos[lightbox]!}
              alt={`View facing ${DIRECTION_LABEL[lightbox]}`}
              className="max-h-[80vh] w-full rounded object-contain"
            />
            <figcaption className="mt-2 flex items-baseline justify-between gap-4 text-xs text-ink-muted">
              <span>
                Facing {DIRECTION_LABEL[lightbox]}
                {captions?.[lightbox] ? ` · ${captions[lightbox]}` : ''}
              </span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded border border-line px-2 py-1 text-[11px] hover:text-leaf"
              >
                Close
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
