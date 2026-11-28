import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Album, type Photo } from '../api'
import { Thumb } from '../components/Thumb'
import { errorText, useNotify } from '../notices'
import { PhotoEditor } from './PhotoEditor'
import { UploadQueue } from './UploadQueue'

type AlbumFilter = 'all' | 'none' | number
type StatusFilter = 'all' | 'published' | 'draft'

type Props = { albums: Album[]; onAlbumsChanged: () => void }

export function LibraryView({ albums, onAlbumsChanged }: Props) {
  const notify = useNotify()
  const [albumFilter, setAlbumFilter] = useState<AlbumFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [dragId, setDragId] = useState<number | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [moveTarget, setMoveTarget] = useState('')

  const load = useCallback(async () => {
    setPhotos(null)
    try {
      const list = await api.photos({
        album: albumFilter === 'all' ? undefined : albumFilter,
        status: status === 'all' ? undefined : status,
      })
      setPhotos(list)
    } catch (err) {
      notify(errorText(err), 'error')
      setPhotos([])
    }
  }, [albumFilter, status, notify])

  useEffect(() => {
    void load()
    setChecked(new Set())
    setConfirmBulkDelete(false)
  }, [load])

  const selected = photos?.find((p) => p.id === selectedId) ?? null
  const albumTitle = useMemo(() => new Map(albums.map((a) => [a.id, a.title])), [albums])
  const inOneAlbum = typeof albumFilter === 'number' && status === 'all'
  const currentAlbum = typeof albumFilter === 'number' ? albums.find((a) => a.id === albumFilter) : undefined

  function belongsHere(p: Photo) {
    const albumOk = albumFilter === 'all' || (albumFilter === 'none' ? p.album === null : p.album === albumFilter)
    const statusOk = status === 'all' || (status === 'published') === p.is_published
    return albumOk && statusOk
  }

  function replacePhoto(updated: Photo) {
    setPhotos((list) => (list ?? []).flatMap((p) => (p.id === updated.id ? (belongsHere(updated) ? [updated] : []) : [p])))
    if (!belongsHere(updated)) setSelectedId(null)
    onAlbumsChanged()
  }

  function removePhotos(ids: number[]) {
    const gone = new Set(ids)
    setPhotos((list) => (list ?? []).filter((p) => !gone.has(p.id)))
    setChecked(new Set())
    if (selectedId != null && gone.has(selectedId)) setSelectedId(null)
    onAlbumsChanged()
  }

  async function saveOrder(list: Photo[]) {
    try {
      await api.reorderPhotos(list.map((p) => p.id))
    } catch (err) {
      notify(errorText(err), 'error')
      void load()
    }
  }

  function moveSelected(delta: -1 | 1) {
    if (!photos || selectedId == null) return
    const i = photos.findIndex((p) => p.id === selectedId)
    const j = i + delta
    if (i < 0 || j < 0 || j >= photos.length) return
    const next = [...photos]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPhotos(next)
    void saveOrder(next)
  }

  function dragOver(targetId: number) {
    if (dragId == null || dragId === targetId || !photos) return
    const from = photos.findIndex((p) => p.id === dragId)
    const to = photos.findIndex((p) => p.id === targetId)
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setPhotos(next)
  }

  async function bulk(action: 'publish' | 'unpublish' | 'delete' | 'move') {
    const ids = [...checked]
    try {
      const album = action === 'move' ? (moveTarget === '' ? null : Number(moveTarget)) : undefined
      const res = await api.bulkPhotos(ids, action, album)
      if (action === 'delete') {
        removePhotos(ids)
        notify(`Deleted ${res.deleted ?? ids.length} photos`)
      } else {
        const skipped = res.skipped_missing_alt_text?.length ?? 0
        notify(
          skipped ? `Updated ${res.updated} · ${skipped} skipped: add alt text first` : `Updated ${res.updated} photos`,
          skipped ? 'error' : 'ok',
        )
        setChecked(new Set())
        void load()
        onAlbumsChanged()
      }
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setConfirmBulkDelete(false)
    }
  }

  function toggleChecked(id: number) {
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIndex = photos && selectedId != null ? photos.findIndex((p) => p.id === selectedId) : -1
  const heading =
    albumFilter === 'all' ? 'All photos' : albumFilter === 'none' ? 'Unsorted' : (currentAlbum?.title ?? 'Series')

  return (
    <div className="library">
      <nav className="library__nav" aria-label="Filter by series">
        <p className="library__nav-label">Library</p>
        <FilterLink active={albumFilter === 'all'} onClick={() => setAlbumFilter('all')} label="All photos" />
        <FilterLink active={albumFilter === 'none'} onClick={() => setAlbumFilter('none')} label="Unsorted" />
        <p className="library__nav-label">Series</p>
        {albums.length === 0 && <p className="field__hint">No series yet. Create one in the Series tab.</p>}
        {albums.map((a) => (
          <FilterLink
            key={a.id}
            active={albumFilter === a.id}
            onClick={() => setAlbumFilter(a.id)}
            label={a.title}
            meta={`${a.photo_count ?? 0}${a.is_published ? '' : ' · draft'}`}
          />
        ))}
      </nav>

      <div className="library__main">
        <div className="library__head">
          <h1>{heading}</h1>
          <div className="segmented" role="group" aria-label="Filter by status">
            {(['all', 'published', 'draft'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === 'all' ? 'All' : s === 'published' ? 'Published' : 'Drafts'}
              </button>
            ))}
          </div>
        </div>

        <UploadQueue
          albumId={typeof albumFilter === 'number' ? albumFilter : null}
          albumLabel={currentAlbum ? `“${currentAlbum.title}”` : 'Unsorted'}
          onUploaded={(photo) => {
            if (belongsHere(photo)) setPhotos((list) => [...(list ?? []), photo])
            onAlbumsChanged()
          }}
        />

        {checked.size > 0 && (
          <div className="bulkbar" role="region" aria-label="Selected photos">
            <span>{checked.size} selected</span>
            <button type="button" className="btn btn--small" onClick={() => void bulk('publish')}>
              Publish
            </button>
            <button type="button" className="btn btn--small" onClick={() => void bulk('unpublish')}>
              Unpublish
            </button>
            <label className="bulkbar__move">
              <span className="visually-hidden">Move to series</span>
              <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>
                <option value="">Unsorted</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn--small" onClick={() => void bulk('move')}>
              Move
            </button>
            {confirmBulkDelete ? (
              <button type="button" className="btn btn--small btn--danger" onClick={() => void bulk('delete')}>
                Confirm delete {checked.size}
              </button>
            ) : (
              <button type="button" className="btn btn--small btn--danger-outline" onClick={() => setConfirmBulkDelete(true)}>
                Delete
              </button>
            )}
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setChecked(new Set())}>
              Clear
            </button>
          </div>
        )}

        {inOneAlbum && photos && photos.length > 1 && (
          <p className="field__hint">Drag photos to change their order in this series. It saves automatically.</p>
        )}

        {photos === null ? (
          <p className="muted">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="empty">No photos here yet.</p>
        ) : (
          <ul className="grid" role="list">
            {photos.map((p) => (
              <li
                key={p.id}
                className={`card${p.id === selectedId ? ' card--selected' : ''}${dragId === p.id ? ' card--dragging' : ''}`}
                draggable={inOneAlbum}
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => {
                  if (!inOneAlbum) return
                  e.preventDefault()
                  dragOver(p.id)
                }}
                onDragEnd={() => {
                  if (dragId != null && photos) void saveOrder(photos)
                  setDragId(null)
                }}
              >
                <label className="card__check">
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggleChecked(p.id)} />
                  <span className="visually-hidden">Select {p.title || 'photo'}</span>
                </label>
                <button type="button" className="card__open" onClick={() => setSelectedId(p.id)} aria-label={`Edit ${p.title || 'photo'}`}>
                  <div className="card__img">
                    <Thumb src={p.src} alt="" />
                    <span className={`badge ${p.is_published ? 'badge--live' : 'badge--draft'}`}>
                      {p.is_published ? 'Published' : 'Draft'}
                    </span>
                    {!p.alt_text && <span className="badge badge--warn">Needs alt text</span>}
                  </div>
                  <span className="card__meta">
                    <span className="card__title">{p.title || 'Untitled'}</span>
                    <span className="muted">{p.album == null ? 'Unsorted' : (albumTitle.get(p.album) ?? '')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <PhotoEditor
          photo={selected}
          albums={albums}
          canMove={{ earlier: inOneAlbum && selectedIndex > 0, later: inOneAlbum && selectedIndex >= 0 && selectedIndex < (photos?.length ?? 0) - 1 }}
          onMove={moveSelected}
          onSaved={replacePhoto}
          onDeleted={(id) => removePhotos([id])}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function FilterLink({ active, onClick, label, meta }: { active: boolean; onClick: () => void; label: string; meta?: string }) {
  return (
    <button type="button" className={`navlink${active ? ' navlink--active' : ''}`} aria-current={active || undefined} onClick={onClick}>
      <span>{label}</span>
      {meta && <span className="muted">{meta}</span>}
    </button>
  )
}
