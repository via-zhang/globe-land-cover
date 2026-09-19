import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { DIRECTION_LABEL, previewUrl, type Direction } from '../lib/observation'

/**
 * Six GLOBE direction photos, mapped onto the inside of a cube.
 *
 * Face order for BoxGeometry is [+X, -X, +Y, -Y, +Z, -Z]. With the camera at
 * the origin looking down -Z, that reads as east, west, up, down, south,
 * north. Materials use BackSide so we see the inside of the cube, which
 * mirrors each face horizontally — the compositor mirrors the photo back.
 *
 * Every photo is centre-cropped to a square so it fills its face completely.
 * GLOBE photos come in 4:3, 16:9 and portrait, and fitting them whole left
 * uneven margins between faces; cropping trades the edges of the frame for a
 * continuous view. Only a missing photo shows grey now.
 */
const FACE_ORDER: Direction[] = ['East', 'West', 'Upward', 'Downward', 'South', 'North']

/** Face texture resolution. */
const FACE_PX = 1024

/**
 * Horizontal field of view, in degrees. Comfortably past one 90° face, so the
 * view opens on a whole direction with a good part of its neighbours either
 * side. Much beyond this and the flat cube faces start to stretch at the
 * corners, which gnomonic projection makes unavoidable.
 */
const TARGET_HFOV = 118

const MISSING_FILL = '#c3c9d1'
const MISSING_GRID = '#b3bac4'

/** Yaw in radians that puts each direction at the centre of the view. */
const HEADING: Record<Direction, number> = {
  North: 0,
  East: -Math.PI / 2,
  South: Math.PI,
  West: Math.PI / 2,
  Upward: 0,
  Downward: 0,
}

/** Vertical FOV that yields TARGET_HFOV at the given viewport aspect. */
function baseFovFor(aspect: number): number {
  const half = THREE.MathUtils.degToRad(TARGET_HFOV) / 2
  const vertical = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(half) / Math.max(aspect, 0.2)))
  return THREE.MathUtils.clamp(vertical, 40, 94)
}

function drawMissing(ctx: CanvasRenderingContext2D, size: number) {
  ctx.fillStyle = MISSING_FILL
  ctx.fillRect(0, 0, size, size)
  // A faint grid keeps a blank face from reading as a rendering failure.
  ctx.strokeStyle = MISSING_GRID
  ctx.lineWidth = 2
  const step = size / 8
  ctx.beginPath()
  for (let i = 1; i < 8; i += 1) {
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, size)
    ctx.moveTo(0, i * step)
    ctx.lineTo(size, i * step)
  }
  ctx.stroke()
}

/**
 * Centre-crop the photo to a square face. Scaling to cover means the shorter
 * edge fills and the longer edge overflows, so a 4:3 photo loses about an
 * eighth from each side and a portrait photo loses top and bottom.
 */
function composeFace(image: HTMLImageElement | null, size = FACE_PX): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  if (!image) {
    drawMissing(ctx, size)
    return canvas
  }

  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale

  // Undo the horizontal mirror that BackSide rendering introduces.
  ctx.save()
  ctx.translate(size, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
  ctx.restore()
  return canvas
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const done = (value: HTMLImageElement | null) => {
      image.onload = image.onerror = null
      resolve(signal.aborted ? null : value)
    }
    image.onload = () => done(image)
    image.onerror = () => done(null)
    signal.addEventListener('abort', () => done(null), { once: true })
    image.src = url
  })
}

const COMPASS = 76
const COMPASS_R = COMPASS / 2

/** Screen bearing, clockwise from north, for each horizontal face. */
const BEARING: Array<{ direction: Direction; label: string; bearing: number }> = [
  { direction: 'North', label: 'N', bearing: 0 },
  { direction: 'East', label: 'E', bearing: 90 },
  { direction: 'South', label: 'S', bearing: 180 },
  { direction: 'West', label: 'W', bearing: 270 },
]

/**
 * A fixed compass card with a rotating view cone.
 *
 * The cone is driven imperatively from the render loop — binding a continuous
 * heading into React state would re-render the panel every frame.
 */
function Compass({
  photos,
  facing,
  ringRef,
  headingRef,
  onPick,
}: {
  photos: Record<Direction, string | null>
  facing: Direction
  ringRef: React.RefObject<SVGGElement | null>
  headingRef: React.RefObject<HTMLSpanElement | null>
  onPick: (direction: Direction) => void
}) {
  return (
    <div className="flex items-end gap-1.5">
      <div className="relative">
        <svg
          width={COMPASS}
          height={COMPASS}
          viewBox={`0 0 ${COMPASS} ${COMPASS}`}
          aria-hidden
          className="drop-shadow-lg"
        >
          <circle cx={COMPASS_R} cy={COMPASS_R} r={COMPASS_R - 1} fill="rgb(6 8 11 / 0.72)" />
          <circle
            cx={COMPASS_R}
            cy={COMPASS_R}
            r={COMPASS_R - 1}
            fill="none"
            stroke="#2b3947"
            strokeWidth={1}
          />

          {/* Graduation every 15°, longer at the cardinals. */}
          {Array.from({ length: 24 }, (_, i) => {
            const angle = (i * 15 - 90) * (Math.PI / 180)
            const cardinal = i % 6 === 0
            const outer = COMPASS_R - 3
            const inner = outer - (cardinal ? 5 : 2.5)
            return (
              <line
                key={i}
                x1={COMPASS_R + Math.cos(angle) * inner}
                y1={COMPASS_R + Math.sin(angle) * inner}
                x2={COMPASS_R + Math.cos(angle) * outer}
                y2={COMPASS_R + Math.sin(angle) * outer}
                stroke={cardinal ? '#5b7488' : '#33424f'}
                strokeWidth={cardinal ? 1.2 : 0.8}
              />
            )
          })}

          {/* The cone showing where the camera is pointed. It stops short of
              the cardinal ring so the letters stay legible over it. */}
          <g ref={ringRef} style={{ transformOrigin: `${COMPASS_R}px ${COMPASS_R}px` }}>
            <path
              d={`M${COMPASS_R} ${COMPASS_R} L${COMPASS_R - 7} ${COMPASS_R - 19} A20 20 0 0 1 ${
                COMPASS_R + 7
              } ${COMPASS_R - 19} Z`}
              fill="#86efac"
              fillOpacity={0.24}
            />
            <line
              x1={COMPASS_R}
              y1={COMPASS_R}
              x2={COMPASS_R}
              y2={COMPASS_R - 19}
              stroke="#86efac"
              strokeWidth={1.4}
            />
          </g>

          <circle cx={COMPASS_R} cy={COMPASS_R} r={2} fill="#86efac" />
        </svg>

        {/* Cardinal labels sit above the SVG so they stay clickable. */}
        {BEARING.map(({ direction, label, bearing }) => {
          const has = photos[direction] !== null
          const active = facing === direction
          const angle = (bearing - 90) * (Math.PI / 180)
          const r = COMPASS_R - 9
          return (
            <button
              key={direction}
              type="button"
              onClick={() => onPick(direction)}
              aria-pressed={active}
              title={has ? `Look ${DIRECTION_LABEL[direction]}` : 'Photo missing'}
              style={{
                left: COMPASS_R + Math.cos(angle) * r,
                top: COMPASS_R + Math.sin(angle) * r,
                textShadow: '0 0 4px rgb(0 0 0 / 0.9)',
              }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-1 font-mono text-[10px] leading-none font-semibold transition ${
                active
                  ? 'text-leaf'
                  : has
                    ? 'text-ink hover:text-leaf'
                    : 'text-ink-faint/50 hover:text-ink-faint line-through decoration-1'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <span
        ref={headingRef}
        className="pb-1 font-mono text-[10px] tracking-tight text-ink-muted tabular-nums"
      >
        000°
      </span>
    </div>
  )
}

interface Props {
  photos: Record<Direction, string | null>
  /** Re-mounts the scene when the selected observation changes. */
  observationId: number
}

export default function PanoramaViewer({ photos, observationId }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([])
  const yawRef = useRef(0)
  const pitchRef = useRef(0)
  const targetYawRef = useRef<number | null>(null)
  /** Set from the viewport shape; the user's zoom multiplies it. */
  const baseFovRef = useRef(baseFovFor(16 / 10))
  /** Where zoom is now, and where input wants it — eased between in the loop. */
  const zoomRef = useRef(1)
  const zoomTargetRef = useRef(1)
  /** The FOV actually in use, for scaling drag sensitivity. */
  const fovRef = useRef(baseFovRef.current)
  /** Every pointer currently down, so two fingers can be told from one. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)

  const pointerDistance = useCallback(() => {
    const [a, b] = [...pointersRef.current.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }, [])
  /** Driven from the render loop rather than React state — see Compass. */
  const coneRef = useRef<SVGGElement>(null)
  const headingRef = useRef<HTMLSpanElement>(null)

  const [facing, setFacing] = useState<Direction>('North')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  // --- scene -------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      setFailed(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      fovRef.current,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000,
    )

    const materials = FACE_ORDER.map(
      () =>
        new THREE.MeshBasicMaterial({
          side: THREE.BackSide,
          map: new THREE.CanvasTexture(composeFace(null, 256)),
        }),
    )
    materialsRef.current = materials

    const cube = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), materials)
    scene.add(cube)

    let frame = 0
    const render = () => {
      // Ease toward a direction when a compass button was pressed.
      if (targetYawRef.current !== null) {
        const delta = targetYawRef.current - yawRef.current
        if (Math.abs(delta) < 0.002) {
          yawRef.current = targetYawRef.current
          targetYawRef.current = null
        } else {
          yawRef.current += delta * 0.12
        }
      }
      // Ease toward the requested zoom so wheel notches glide instead of
      // stepping; the factor is high enough that a pinch still feels direct.
      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.25
      fovRef.current = THREE.MathUtils.clamp(baseFovRef.current * zoomRef.current, 30, 100)
      camera.fov = fovRef.current
      camera.updateProjectionMatrix()
      camera.quaternion.setFromEuler(
        new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ'),
      )
      renderer.render(scene, camera)

      // Yaw runs anticlockwise; compass bearings run clockwise from north.
      const bearing = (((-yawRef.current * 180) / Math.PI) % 360 + 360) % 360
      if (coneRef.current) coneRef.current.style.transform = `rotate(${bearing}deg)`
      if (headingRef.current) {
        headingRef.current.textContent = `${String(Math.round(bearing) % 360).padStart(3, '0')}°`
      }

      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      if (clientWidth === 0 || clientHeight === 0) return
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / clientHeight
      // Keep one face filling the frame whatever shape the panel takes.
      baseFovRef.current = baseFovFor(camera.aspect)
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    /*
     * Safari on iOS fires its own pinch gestures and will zoom the whole page
     * even where touch-action is none, so they are swallowed here. Other
     * browsers never fire these, and `wheel` needs a non-passive listener to
     * be cancellable at all.
     */
    const swallow = (event: Event) => event.preventDefault()
    const gestures = ['gesturestart', 'gesturechange', 'gestureend']
    for (const name of gestures) mount.addEventListener(name, swallow)
    mount.addEventListener('wheel', swallow, { passive: false })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const name of gestures) mount.removeEventListener(name, swallow)
      mount.removeEventListener('wheel', swallow)
      materials.forEach((material) => {
        material.map?.dispose()
        material.dispose()
      })
      cube.geometry.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      materialsRef.current = []
    }
  }, [])

  // --- textures ----------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)

    // Reset the view so a new observation always opens facing north.
    yawRef.current = 0
    pitchRef.current = 0
    targetYawRef.current = null
    zoomRef.current = 1
    zoomTargetRef.current = 1
    pointersRef.current.clear()
    pinchRef.current = null
    setFacing('North')

    const apply = (index: number, image: HTMLImageElement | null, size: number) => {
      const material = materialsRef.current[index]
      if (!material || signal.aborted) return
      material.map?.dispose()
      material.map = new THREE.CanvasTexture(composeFace(image, size))
      material.map.colorSpace = THREE.SRGBColorSpace
      material.needsUpdate = true
    }

    const run = async () => {
      // Blank every face first so photos never linger from the last selection.
      FACE_ORDER.forEach((_, index) => apply(index, null, 256))

      // data.globe.gov serves a ~6 KB small.jpg beside each original, so the
      // cube fills in almost immediately and sharpens a moment later.
      await Promise.all(
        FACE_ORDER.map(async (direction, index) => {
          const url = photos[direction]
          if (!url) return
          const preview = await loadImage(previewUrl(url), signal)
          if (preview) apply(index, preview, 512)
        }),
      )
      if (signal.aborted) return
      setLoading(false)

      await Promise.all(
        FACE_ORDER.map(async (direction, index) => {
          const url = photos[direction]
          if (!url) return
          const full = await loadImage(url, signal)
          if (full) apply(index, full, FACE_PX)
        }),
      )
    }

    void run()
    return () => controller.abort()
  }, [photos, observationId])

  // --- pointer, wheel and keyboard --------------------------------------
  const updateFacing = useCallback(() => {
    const turns = yawRef.current / (Math.PI * 2)
    const normalized = ((turns % 1) + 1) % 1
    const quadrant = Math.round(normalized * 4) % 4
    setFacing((['North', 'West', 'South', 'East'] as Direction[])[quadrant])
  }, [])

  /**
   * One finger looks around, two fingers pinch to zoom.
   *
   * Tracked through pointer events rather than touch events so mouse, pen and
   * touch share one path. Every active pointer is kept so a second finger
   * switches cleanly into a pinch and back out again without the view jumping.
   */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const element = event.currentTarget
      try {
        element.setPointerCapture(event.pointerId)
      } catch {
        // The pointer can already be gone; tracking below still works.
      }
      targetYawRef.current = null
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointersRef.current.size === 2) {
        pinchRef.current = { distance: pointerDistance(), zoom: zoomTargetRef.current }
      }
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointers.size >= 2) {
        const pinch = pinchRef.current
        if (!pinch) return
        const distance = pointerDistance()
        if (distance <= 0) return
        // Spreading the fingers narrows the field of view.
        zoomTargetRef.current = THREE.MathUtils.clamp(
          (pinch.zoom * pinch.distance) / distance,
          0.5,
          1.5,
        )
        return
      }

      const scale = (fovRef.current / 68) * 0.0042
      yawRef.current += (event.clientX - previous.x) * scale
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + (event.clientY - previous.y) * scale,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01,
      )
      updateFacing()
    },
    [updateFacing],
  )

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    // Lifting one finger of a pinch must not snap the view: the remaining
    // pointer's stored position is already current, so panning resumes from
    // where it is rather than from where the pinch began.
    if (pointersRef.current.size < 2) pinchRef.current = null
  }, [])

  const onWheel = useCallback((event: React.WheelEvent) => {
    // Trackpad pinch arrives as ctrl+wheel and is far finer than mouse notches.
    const step = event.ctrlKey ? event.deltaY * 0.004 : event.deltaY * 0.0012
    zoomTargetRef.current = THREE.MathUtils.clamp(zoomTargetRef.current + step, 0.5, 1.5)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = Math.PI / 24
      if (event.key === 'ArrowLeft') yawRef.current += step
      else if (event.key === 'ArrowRight') yawRef.current -= step
      else if (event.key === 'ArrowUp')
        pitchRef.current = Math.min(pitchRef.current + step, Math.PI / 2 - 0.01)
      else if (event.key === 'ArrowDown')
        pitchRef.current = Math.max(pitchRef.current - step, -Math.PI / 2 + 0.01)
      else return
      event.preventDefault()
      targetYawRef.current = null
      updateFacing()
    },
    [updateFacing],
  )

  const lookAt = useCallback((direction: Direction) => {
    if (direction === 'Upward' || direction === 'Downward') {
      pitchRef.current = direction === 'Upward' ? Math.PI / 2 - 0.01 : -Math.PI / 2 + 0.01
      return
    }
    pitchRef.current = 0
    // Turn the short way round rather than unwinding several revolutions.
    const turns = Math.round((yawRef.current - HEADING[direction]) / (Math.PI * 2))
    targetYawRef.current = HEADING[direction] + turns * Math.PI * 2
    setFacing(direction)
  }, [])

  if (failed) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line bg-surface px-6 text-center text-sm text-ink-muted">
        This browser could not start WebGL, so the 360° view is unavailable. The
        photos are listed below.
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-black">
      <div
        ref={mountRef}
        role="application"
        aria-label="Interactive 360 degree view of the observation site. Drag to look around, or use the arrow keys."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="aspect-[4/3] w-full cursor-grab touch-none active:cursor-grabbing sm:aspect-[16/10]"
      />

      {loading && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45">
          <span className="animate-pulse text-xs tracking-wide text-ink-muted">
            Loading photos…
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent p-2.5">
        <div className="pointer-events-auto flex items-end gap-2">
          <Compass
            photos={photos}
            facing={facing}
            ringRef={coneRef}
            headingRef={headingRef}
            onPick={lookAt}
          />
          <div className="flex flex-col gap-1">
            {(['Upward', 'Downward'] as Direction[]).map((direction) => {
              const has = photos[direction] !== null
              return (
                <button
                  key={direction}
                  type="button"
                  onClick={() => lookAt(direction)}
                  title={has ? `Look ${DIRECTION_LABEL[direction]}` : 'Photo missing'}
                  className={`rounded-sm px-1.5 py-1 font-mono text-[9px] tracking-widest uppercase transition ${
                    has
                      ? 'bg-white/12 text-ink hover:bg-white/22'
                      : 'bg-white/5 text-ink-faint hover:bg-white/10'
                  }`}
                >
                  {DIRECTION_LABEL[direction]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
