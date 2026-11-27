import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import type { Photo } from '../types'
import { ResponsiveImage } from './ResponsiveImage'

type Props = {
  albumTitle: string
  photos: Photo[]
  index: number
  onClose: () => void
  onIndexChange: (index: number) => void
}

const SWIPE_THRESHOLD = 50

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Full-screen photo viewer: keyboard (← → Esc), swipe, and an info panel. */
export function Lightbox({ albumTitle, photos, index, onClose, onIndexChange }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchStartX = useRef<number | null>(null)
  const [showInfo, setShowInfo] = useState(() => window.matchMedia('(min-width: 900px)').matches)

  const photo = photos[index]
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  // Focus the dialog on open, lock page scroll, and restore focus on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  // Preload neighbours so arrowing through feels instant.
  useEffect(() => {
    for (const n of [photos[index - 1], photos[index + 1]]) {
      const url = n?.src.large?.url ?? n?.src.medium?.url
      if (url) new Image().src = url
    }
  }, [index, photos])

  function go(delta: number) {
    const next = index + delta
    if (next >= 0 && next < photos.length) onIndexChange(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStartX.current
    const end = e.changedTouches[0]?.clientX
    touchStartX.current = null
    if (start == null || end == null) return
    if (end - start > SWIPE_THRESHOLD) go(-1)
    else if (start - end > SWIPE_THRESHOLD) go(1)
  }

  if (!photo) return null

  const exifRows = [
    ['Camera', photo.exif.camera],
    ['Lens', photo.exif.lens],
    ['Settings', [photo.exif.focal_length, photo.exif.aperture, photo.exif.shutter_speed, photo.exif.iso && `ISO ${photo.exif.iso}`].filter(Boolean).join(' · ')],
    ['Taken', formatDate(photo.taken_at)],
    ['Place', photo.location],
  ].filter(([, v]) => Boolean(v))

  return (
    <div
      ref={dialogRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${albumTitle}: photo ${index + 1} of ${photos.length}`}
      onKeyDown={onKeyDown}
    >
      <div className="lightbox__bar">
        <span className="lightbox__count" aria-live="polite">
          {albumTitle} · {index + 1} / {photos.length}
        </span>
        <div className="lightbox__bar-actions">
          <button type="button" className="pill-button" aria-pressed={showInfo} onClick={() => setShowInfo((s) => !s)}>
            Info
          </button>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close viewer" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
      </div>

      <div className="lightbox__body">
        <button type="button" className="icon-button lightbox__nav" aria-label="Previous photo" disabled={!hasPrev} onClick={() => go(-1)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M11 3L5 9l6 6" />
          </svg>
        </button>

        <div className="lightbox__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <figure className="lightbox__figure">
            <ResponsiveImage
              key={photo.id}
              src={photo.src}
              alt={photo.alt_text}
              width={photo.width}
              height={photo.height}
              sizes="(max-width: 900px) 100vw, 75vw"
              from="medium"
              eager
              className="lightbox__image"
            />
          </figure>
          {showInfo && (
            <aside className="lightbox__info" aria-label="Photo details">
              {photo.title && <h2 className="lightbox__title">{photo.title}</h2>}
              {photo.caption && <p className="lightbox__caption">{photo.caption}</p>}
              {exifRows.length > 0 && (
                <dl className="lightbox__exif">
                  {exifRows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </aside>
          )}
        </div>

        <button type="button" className="icon-button lightbox__nav" aria-label="Next photo" disabled={!hasNext} onClick={() => go(1)}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M7 3l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
