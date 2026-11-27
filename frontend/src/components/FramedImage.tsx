import type { GridRatio, GridSources, ImageSources } from '../types'
import { ResponsiveImage } from './ResponsiveImage'

type Source = {
  alt_text: string
  width: number
  height: number
  src: ImageSources
  grid_src: GridSources | null
}

type Props = {
  image: Source | null | undefined
  /** Shape of the cell. */
  ratio: GridRatio
  sizes: string
  eager?: boolean
  alt?: string
}

const RATIO_CSS: Record<GridRatio, string> = {
  '3:4': '3 / 4',
  '4:3': '4 / 3',
  '16:9': '16 / 9',
  '9:16': '9 / 16',
}

/**
 * A fixed-shape cell that shows the whole photo, never cropped: the image is
 * fitted inside with even margins. If the photographer cropped the photo in
 * the dashboard, that cropped version is used instead.
 */
export function FramedImage({ image, ratio, sizes, eager, alt }: Props) {
  const grid = image?.grid_src
  const gridSize = grid?.medium ?? grid?.thumb
  const src = grid ?? image?.src
  const width = gridSize?.width ?? image?.width ?? 4
  const height = gridSize?.height ?? image?.height ?? 3

  return (
    <div className="frame" style={{ aspectRatio: RATIO_CSS[ratio] }}>
      <div className="frame__inner">
        {image ? (
          <ResponsiveImage
            src={src}
            alt={alt ?? image.alt_text}
            width={width}
            height={height}
            sizes={sizes}
            eager={eager}
            className="frame__img"
          />
        ) : (
          <div className="image-placeholder frame__img" />
        )}
      </div>
    </div>
  )
}
