// Shapes returned by the public API (backend/gallery/serializers.py).

export type ImageVariant = { url: string; width: number; height: number }

/** Keyed by variant name: "thumb" (480px), "medium" (1200px), "large" (2400px). */
export type ImageSources = Partial<Record<'thumb' | 'medium' | 'large', ImageVariant>>

export type Exif = Partial<{
  camera: string
  lens: string
  focal_length: string
  aperture: string
  shutter_speed: string
  iso: number
}>

/** Cropped versions chosen in the dashboard, used only in grids and covers. */
export type GridSources = ImageSources & { ratio: GridRatio }

export type GridRatio = '3:4' | '4:3' | '16:9' | '9:16'

export type Photo = {
  id: number
  title: string
  caption: string
  alt_text: string
  width: number
  height: number
  src: ImageSources
  grid_src: GridSources | null
  taken_at: string | null
  location: string
  exif: Exif
}

export type Cover = Pick<Photo, 'alt_text' | 'width' | 'height' | 'src' | 'grid_src'>

export type AlbumSummary = {
  slug: string
  title: string
  year: number | null
  architect: string
  location: string
  grid_ratio: GridRatio
  description: string
  photo_count: number
  cover: Cover | null
}

export type AlbumDetail = AlbumSummary & { photos: Photo[] }

export type Photographer = {
  slug: string
  display_name: string
  tagline: string
  bio_paragraphs: string[]
  location: string
  contact_email: string
  instagram_url: string
  website_url: string
  portrait: { alt_text: string; src: ImageSources } | null
}

export type Homepage = {
  headline: string
  subheadline: string
  hero_video: { url: string; type: string } | null
  poster: ImageSources | null
}

export type Site = {
  photographer: Photographer
  homepage: Homepage
  albums: AlbumSummary[]
}
