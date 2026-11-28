import type { AlbumDetail, Photo, Site } from '../types'

// Placeholder content used only in development when the API is not running.
// Images have no URLs, so the site renders tonal placeholders in their place.

const series = [
  { slug: 'harbour-light', title: '[Series title A]', year: 2026, count: 9 },
  { slug: 'winter-streets', title: '[Series title B]', year: 2025, count: 6 },
  { slug: 'quiet-rooms', title: '[Series title C]', year: 2024, count: 4 },
]

const shapes: Array<[number, number]> = [
  [3000, 2000],
  [2000, 3000],
  [2400, 2400],
  [3000, 2000],
  [2000, 2500],
  [3000, 2000],
]

function samplePhotos(slug: string, count: number): Photo[] {
  return Array.from({ length: count }, (_, i) => {
    const [width, height] = shapes[i % shapes.length]
    return {
      id: slug.length * 100 + i,
      title: `[Photo ${i + 1}]`,
      caption: '[Caption — a sentence about where and why.]',
      alt_text: `Placeholder photo ${i + 1}`,
      width,
      height,
      src: {},
      taken_at: null,
      location: '[Location]',
      exif: { camera: '[Camera]', lens: '[Lens]', aperture: 'f/2.8', shutter_speed: '1/250s', iso: 400 },
    }
  })
}

export const sampleSite: Site = {
  photographer: {
    slug: 'yanying',
    display_name: 'Yanying Zhang',
    tagline: '',
    bio_paragraphs: [
      '[Your story: how you started photographing, what draws you to a scene, and what you hope people feel when they look.]',
      '[A second paragraph: where you shoot, the gear or process you care about, current projects.]',
    ],
    location: 'Montréal',
    contact_email: '',
    instagram_url: '',
    website_url: '',
    portrait: null,
  },
  homepage: {
    headline: 'Light, places, and the quiet in between.',
    subheadline: '',
    hero_video: null,
    poster: null,
  },
  albums: series.map((s) => ({
    slug: s.slug,
    title: s.title,
    year: s.year,
    description: '[A short introduction to this series.]',
    photo_count: s.count,
    cover: { alt_text: `Cover of ${s.title}`, width: 2000, height: 2500, src: {} },
  })),
}

export function sampleAlbum(slug: string): AlbumDetail | null {
  const album = sampleSite.albums.find((a) => a.slug === slug)
  if (!album) return null
  return { ...album, photos: samplePhotos(slug, album.photo_count) }
}
