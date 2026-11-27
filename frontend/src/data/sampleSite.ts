import type { AlbumDetail, GridRatio, Photo, Site } from '../types'

// Placeholder content used only in development when the API is not running.
// Images have no URLs, so the site renders tonal placeholders in their place.

const series: Array<{ slug: string; title: string; year: number; count: number; ratio: GridRatio }> = [
  { slug: 'project-a', title: '[Project A]', year: 2026, count: 9, ratio: '4:3' },
  { slug: 'project-b', title: '[Project B]', year: 2025, count: 6, ratio: '3:4' },
  { slug: 'project-c', title: '[Project C]', year: 2024, count: 4, ratio: '16:9' },
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
      grid_src: null,
      taken_at: null,
      location: '[Location]',
      exif: { camera: '[Camera]', lens: '[Lens]', aperture: 'f/2.8', shutter_speed: '1/250s', iso: 400 },
    }
  })
}

export const sampleSite: Site = {
  photographer: {
    slug: 'ziyue',
    display_name: 'Ziyue',
    tagline: '',
    bio_paragraphs: [
      '[Story: how Ziyue came to photograph architecture, and what Ziyue looks for in a building.]',
      '[A second paragraph: the kinds of projects, clients or practices Ziyue works with.]',
    ],
    location: '[City]',
    contact_email: '',
    instagram_url: '',
    website_url: '',
    portrait: null,
  },
  homepage: {
    headline: 'Architecture photography',
    subheadline: '',
    hero_video: null,
    poster: null,
  },
  albums: series.map((s) => ({
    slug: s.slug,
    title: s.title,
    year: s.year,
    architect: '[Architect]',
    location: '[Location]',
    grid_ratio: s.ratio,
    description: '[A short introduction to this project.]',
    photo_count: s.count,
    cover: { alt_text: `Cover of ${s.title}`, width: 3000, height: 2000, src: {}, grid_src: null },
  })),
}

export function sampleAlbum(slug: string): AlbumDetail | null {
  const album = sampleSite.albums.find((a) => a.slug === slug)
  if (!album) return null
  return { ...album, photos: samplePhotos(slug, album.photo_count) }
}
