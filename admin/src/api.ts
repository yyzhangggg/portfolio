// Client for the admin API (backend/gallery/views.py). All requests go to /api
// on the dashboard's own origin: the Vite dev server proxies them to Django,
// and on Vercel a rewrite forwards them to Render, so the session cookie is a
// first-party cookie.

export type ImageVariant = { url: string; width: number; height: number }
export type ImageSources = Partial<Record<'thumb' | 'medium' | 'large', ImageVariant>>

export type Me =
  | { authenticated: false }
  | { authenticated: true; username: string; photographer: { slug: string; display_name: string } }

export type Album = {
  id: number
  title: string
  slug: string
  description: string
  year: number | null
  cover: number | null
  cover_src: ImageSources | null
  is_published: boolean
  display_order: number
  photo_count?: number
}

export type Photo = {
  id: number
  album: number | null
  title: string
  caption: string
  alt_text: string
  taken_at: string | null
  location: string
  camera: string
  lens: string
  focal_length: string
  aperture: string
  shutter_speed: string
  iso: number | null
  is_published: boolean
  display_order: number
  src: ImageSources
  width: number
  height: number
  file_size: number
  original_filename: string
  created_at: string
}

export type Homepage = {
  headline: string
  subheadline: string
  hero_video: { url: string; type: string } | null
  poster: ImageSources | null
  updated_at: string
}

export type Profile = {
  slug: string
  display_name: string
  tagline: string
  bio: string
  location: string
  contact_email: string
  instagram_url: string
  website_url: string
  portrait: ImageSources | null
  portrait_alt: string
}

export type UploadKind = 'photo' | 'poster' | 'portrait' | 'hero_video'

type UploadTicket = {
  kind: UploadKind
  key: string
  max_bytes: number
  upload: { url: string; method: 'PUT'; headers: Record<string, string> }
}

/** An API error, with DRF's per-field messages when there are any. */
export class ApiError extends Error {
  status: number
  fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

function readCookie(name: string): string {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : ''
}

function firstMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return firstMessage(value[0])
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0])
  return ''
}

async function toError(res: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Not JSON (e.g. Django's CSRF failure page).
  }
  const fields: Record<string, string> = {}
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) fields[k] = firstMessage(v)
  }
  const message =
    fields.detail ||
    fields.non_field_errors ||
    Object.values(fields)[0] ||
    (res.status === 403 ? 'Your session has expired. Please log in again.' : `Request failed (${res.status}).`)
  return new ApiError(res.status, message, fields)
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method !== 'GET') headers['X-CSRFToken'] = readCookie('csrftoken')
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  me: () => request<Me>('GET', '/auth/me/'),
  login: async (username: string, password: string) => {
    await request('GET', '/auth/csrf/')
    return request<Me>('POST', '/auth/login/', { username, password })
  },
  logout: () => request<Me>('POST', '/auth/logout/'),

  albums: () => request<Album[]>('GET', '/albums/'),
  createAlbum: (data: Partial<Album>) => request<Album>('POST', '/albums/', data),
  updateAlbum: (id: number, data: Partial<Album>) => request<Album>('PATCH', `/albums/${id}/`, data),
  deleteAlbum: (id: number) => request<void>('DELETE', `/albums/${id}/`),
  reorderAlbums: (ids: number[]) => request<void>('POST', '/albums/reorder/', { ids }),

  photos: (filter: { album?: number | 'none'; status?: 'published' | 'draft' } = {}) => {
    const q = new URLSearchParams()
    if (filter.album !== undefined) q.set('album', String(filter.album))
    if (filter.status) q.set('status', filter.status)
    const qs = q.toString()
    return request<Photo[]>('GET', `/photos/${qs ? `?${qs}` : ''}`)
  },
  confirmPhoto: (data: { key: string; album?: number | null; original_filename?: string }) =>
    request<Photo>('POST', '/photos/', data),
  updatePhoto: (id: number, data: Partial<Photo>) => request<Photo>('PATCH', `/photos/${id}/`, data),
  deletePhoto: (id: number) => request<void>('DELETE', `/photos/${id}/`),
  reorderPhotos: (ids: number[]) => request<void>('POST', '/photos/reorder/', { ids }),
  bulkPhotos: (ids: number[], action: 'publish' | 'unpublish' | 'delete' | 'move', album?: number | null) =>
    request<{ updated?: number; deleted?: number; skipped_missing_alt_text?: number[] }>('POST', '/photos/bulk/', {
      ids,
      action,
      ...(action === 'move' ? { album } : {}),
    }),

  homepage: () => request<Homepage>('GET', '/homepage/'),
  updateHomepage: (data: Partial<Homepage> & { hero_video_key?: string; poster_key?: string }) =>
    request<Homepage>('PATCH', '/homepage/', data),

  profile: () => request<Profile>('GET', '/profile/'),
  updateProfile: (data: Partial<Profile> & { portrait_key?: string }) => request<Profile>('PATCH', '/profile/', data),
}

/**
 * Uploads a file straight to storage and returns its key, ready to confirm.
 * Large files never pass through Vercel or Render.
 */
export async function uploadFile(kind: UploadKind, file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const ticket = await request<UploadTicket>('POST', '/uploads/', {
    kind,
    content_type: file.type,
    size: file.size,
    filename: file.name,
  })
  const { url, method, headers } = ticket.upload
  // Only the local dev endpoint is on our own origin and needs the CSRF token;
  // R2 would reject the extra header.
  const sameOrigin = url.startsWith('/')

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (sameOrigin) {
      xhr.withCredentials = true
      xhr.setRequestHeader('X-CSRFToken', readCookie('csrftoken'))
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, `Upload failed (${xhr.status}).`)))
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and try again.'))
    xhr.send(file)
  })
  onProgress?.(1)
  return ticket.key
}

export const LIMITS = {
  photoBytes: 40 * 1024 * 1024,
  videoBytes: 30 * 1024 * 1024,
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
