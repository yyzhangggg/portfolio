import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { api, GRID_RATIOS, type CropBox, type GridRatio, type Photo } from '../api'
import { errorText, useNotify } from '../notices'

type Props = {
  photo: Photo
  /** The project's grid ratio, offered first. */
  defaultRatio: GridRatio
  onSaved: (photo: Photo) => void
  onClose: () => void
}

const MIN_SIZE = 0.2
const STEP = 0.01

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Largest box of this ratio that fits the photo, in fractions of its width and height. */
function maxBox(ratio: number, aspect: number) {
  return ratio < aspect ? { width: ratio / aspect, height: 1 } : { width: 1, height: aspect / ratio }
}

function boxFor(ratio: number, aspect: number, size: number, cx: number, cy: number): CropBox {
  const m = maxBox(ratio, aspect)
  const width = m.width * size
  const height = m.height * size
  return {
    x: clamp(cx - width / 2, 0, 1 - width),
    y: clamp(cy - height / 2, 0, 1 - height),
    width,
    height,
  }
}

/**
 * Choose a crop for grid thumbnails and covers. The original and the full
 * photo in the lightbox are never changed.
 */
export function CropEditor({ photo, defaultRatio, onSaved, onClose }: Props) {
  const notify = useNotify()
  const aspect = photo.width / photo.height
  const ratioOf = (r: GridRatio) => GRID_RATIOS.find((g) => g.value === r)!.ratio

  const [ratio, setRatio] = useState<GridRatio>(photo.crop?.ratio ?? defaultRatio)
  const [size, setSize] = useState(() => {
    if (!photo.crop) return 1
    const m = maxBox(ratioOf(photo.crop.ratio), aspect)
    return clamp(photo.crop.box.width / m.width, MIN_SIZE, 1)
  })
  const [center, setCenter] = useState(() =>
    photo.crop
      ? { x: photo.crop.box.x + photo.crop.box.width / 2, y: photo.crop.box.y + photo.crop.box.height / 2 }
      : { x: 0.5, y: 0.5 },
  )
  const [busy, setBusy] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null)

  const box = boxFor(ratioOf(ratio), aspect, size, center.x, center.y)
  // Keep the centre consistent with the clamped box.
  const boxCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, cx: boxCenter.x, cy: boxCenter.y }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    const rect = stageRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    setCenter({ x: d.cx + (e.clientX - d.px) / rect.width, y: d.cy + (e.clientY - d.py) / rect.height })
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      setCenter({ x: boxCenter.x + m[0], y: boxCenter.y + m[1] })
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      setSize((s) => clamp(s + 0.05, MIN_SIZE, 1))
    } else if (e.key === '-') {
      e.preventDefault()
      setSize((s) => clamp(s - 0.05, MIN_SIZE, 1))
    }
  }

  async function save(crop: { ratio: GridRatio; box: CropBox } | null) {
    setBusy(true)
    try {
      onSaved(await api.cropPhoto(photo.id, crop))
      notify(crop ? 'Crop saved' : 'Crop removed. The whole photo is shown.')
      onClose()
    } catch (err) {
      notify(errorText(err), 'error')
      setBusy(false)
    }
  }

  const preview = photo.src.medium ?? photo.src.large ?? photo.src.thumb
  const pct = (v: number) => `${v * 100}%`

  return (
    <section className="cropper" aria-labelledby="crop-heading">
      <h3 id="crop-heading">Crop for grids</h3>
      <p className="field__hint">
        Used only for thumbnails in the project grid and as a cover. The photo still opens whole in the full-screen view.
      </p>

      <div className="segmented segmented--wrap" role="group" aria-label="Crop ratio">
        {GRID_RATIOS.map((g) => (
          <button key={g.value} type="button" aria-pressed={ratio === g.value} onClick={() => setRatio(g.value)}>
            {g.value}
            {g.value === defaultRatio ? ' (project)' : ''}
          </button>
        ))}
      </div>

      <div className="cropper__stage" ref={stageRef} style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
        {preview && <img src={preview.url} alt="" draggable={false} />}
        <div
          className="cropper__box"
          style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height) }}
          tabIndex={0}
          role="group"
          aria-label="Crop area. Drag, or use the arrow keys to move it and + or − to resize."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
        />
      </div>

      <label className="cropper__size">
        <span>Size</span>
        <input
          type="range"
          min={MIN_SIZE}
          max={1}
          step={0.01}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
        />
      </label>

      <div className="editor__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save({ ratio, box })}>
          Save crop
        </button>
        {photo.crop && (
          <button type="button" className="btn" disabled={busy} onClick={() => void save(null)}>
            Remove crop
          </button>
        )}
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  )
}
