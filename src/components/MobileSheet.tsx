import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** Heights the sheet settles on, as a fraction of the viewport. */
const PEEK = 0.62
const FULL = 0.92
/** Dragged below this, the sheet closes instead of snapping back. */
const DISMISS = 0.34

interface Props {
  children: ReactNode
  onClose: () => void
}

/**
 * Bottom sheet that can be dragged between two heights or flung closed.
 *
 * Height is held in pixels while dragging so the sheet tracks the finger
 * exactly, and the CSS transition is switched off for the duration — animating
 * height during a drag is what makes a sheet feel like it is lagging.
 */
export default function MobileSheet({ children, onClose }: Props) {
  const [height, setHeight] = useState(() => window.innerHeight * PEEK)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)

  // Keep the proportions if the device rotates while the sheet is open.
  useEffect(() => {
    const onResize = () => {
      if (dragRef.current) return
      setHeight((current) =>
        Math.min(current, window.innerHeight * FULL),
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Let the close button, and anything else interactive, behave normally.
    if ((event.target as HTMLElement).closest('button, a, input')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    }
    setDragging(true)
  }, [height])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // Dragging up grows the sheet, so the delta is inverted.
    const next = drag.startHeight + (drag.startY - event.clientY)
    setHeight(Math.max(0, Math.min(next, window.innerHeight * FULL)))
  }, [])

  const settle = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      dragRef.current = null
      setDragging(false)

      const viewport = window.innerHeight
      const moved = Math.abs(event.clientY - drag.startY)
      if (moved < 6) {
        // A tap on the handle toggles rather than snapping to where it was.
        setHeight(height > viewport * ((PEEK + FULL) / 2) ? viewport * PEEK : viewport * FULL)
        return
      }
      if (height < viewport * DISMISS) {
        onClose()
        return
      }
      const midpoint = viewport * ((PEEK + FULL) / 2)
      setHeight(height < midpoint ? viewport * PEEK : viewport * FULL)
    },
    [height, onClose],
  )

  const expanded = height > window.innerHeight * ((PEEK + FULL) / 2)

  return (
    <aside
      style={{ height }}
      className={`absolute inset-x-0 bottom-0 z-40 rounded-t-xl border-t border-line shadow-2xl shadow-black/70 ${
        dragging ? '' : 'transition-[height] duration-200'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={expanded ? 'Drag to resize or collapse the panel' : 'Drag to resize or expand the panel'}
        aria-expanded={expanded}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          setHeight(window.innerHeight * (expanded ? PEEK : FULL))
        }}
        className="absolute inset-x-0 top-0 z-10 flex h-7 touch-none cursor-grab items-center justify-center rounded-t-xl bg-surface active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </div>
      <div className="h-full overflow-hidden rounded-t-xl pt-7">{children}</div>
    </aside>
  )
}
