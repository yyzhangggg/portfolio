import { sampleAlbum, sampleSite } from './data/sampleSite'
import type { AlbumDetail, Site } from './types'

// Requests go to /api on this site's own domain: the Vite dev server proxies
// them to Django, and on Vercel a rewrite (vercel.json) forwards them to Render.
const API_BASE = '/api/public'

// Optional: a photographer slug, for when the API hosts more than one.
const PHOTOGRAPHER = import.meta.env.VITE_PHOTOGRAPHER_SLUG as string | undefined

// In development, fall back to sample content when the API is not running, so
// the design can be worked on without a backend. Never in production.
const ALLOW_SAMPLE = import.meta.env.DEV || import.meta.env.VITE_USE_SAMPLE_DATA === 'true'

export class NotFoundError extends Error {}

function url(path: string) {
  const query = PHOTOGRAPHER ? `?photographer=${encodeURIComponent(PHOTOGRAPHER)}` : ''
  return `${API_BASE}${path}${query}`
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url(path), { signal, headers: { Accept: 'application/json' } })
  if (res.status === 404) throw new NotFoundError('Not found')
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) throw new Error('API did not return JSON')
  return (await res.json()) as T
}

function withSampleFallback<T>(load: () => Promise<T>, sample: () => T | null): Promise<T> {
  return load().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const fallback = ALLOW_SAMPLE && !(err instanceof NotFoundError) ? sample() : null
    if (fallback) {
      console.warn('[portfolio] API unavailable, showing sample content.', err)
      return fallback
    }
    throw err
  })
}

export function fetchSite(signal?: AbortSignal): Promise<Site> {
  return withSampleFallback(() => getJson<Site>('/site/', signal), () => sampleSite)
}

export function fetchAlbum(slug: string, signal?: AbortSignal): Promise<AlbumDetail> {
  return withSampleFallback(
    () => getJson<AlbumDetail>(`/albums/${encodeURIComponent(slug)}/`, signal),
    () => sampleAlbum(slug),
  )
}
