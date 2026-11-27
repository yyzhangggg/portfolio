import type { ImageSources } from '../api'

type Props = {
  src: ImageSources | null | undefined
  alt: string
  size?: 'thumb' | 'medium'
  className?: string
}

/** A cropped preview image, or a grey box when there is none yet. */
export function Thumb({ src, alt, size = 'thumb', className = '' }: Props) {
  const v = src?.[size] ?? src?.thumb ?? src?.medium ?? src?.large
  if (!v) return <div className={`thumb thumb--empty ${className}`} role="img" aria-label={alt || 'No image'} />
  return <img className={`thumb ${className}`} src={v.url} alt={alt} width={v.width} height={v.height} loading="lazy" decoding="async" />
}
