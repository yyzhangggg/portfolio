import type { CSSProperties } from 'react'
import type { ImageSources } from '../types'

type Props = {
  src: ImageSources | null | undefined
  alt: string
  width: number
  height: number
  /** The `sizes` attribute: how wide the image is drawn at each breakpoint. */
  sizes: string
  /** Smallest variant to offer; the grid uses "thumb", the lightbox "medium". */
  from?: 'thumb' | 'medium'
  eager?: boolean
  className?: string
  style?: CSSProperties
}

const ORDER = ['thumb', 'medium', 'large'] as const

export function ResponsiveImage({ src, alt, width, height, sizes, from = 'thumb', eager, className, style }: Props) {
  const variants = ORDER.slice(ORDER.indexOf(from))
    .map((name) => src?.[name])
    .filter((v) => v !== undefined)

  if (variants.length === 0) {
    // No image yet (sample content): keep the box so the layout does not shift.
    return (
      <div
        role="img"
        aria-label={alt}
        className={`image-placeholder ${className ?? ''}`}
        style={{ aspectRatio: `${width} / ${height}`, ...style }}
      />
    )
  }

  const largest = variants[variants.length - 1]
  return (
    <img
      className={className}
      style={style}
      src={largest.url}
      srcSet={variants.map((v) => `${v.url} ${v.width}w`).join(', ')}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
