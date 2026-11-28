import { useEffect, useState } from 'react'
import { api, ApiError, GRID_RATIOS, type Album, type GridRatio, type Photo } from '../api'
import { SelectField, TextArea, TextField, Toggle } from '../components/Field'
import { Thumb } from '../components/Thumb'
import { errorText, useNotify } from '../notices'

type Props = { albums: Album[]; reload: () => Promise<void> }

export function SeriesView({ albums, reload }: Props) {
  const notify = useNotify()
  const [list, setList] = useState(albums)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => setList(albums), [albums])

  async function create() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const album = await api.createAlbum({ title: newTitle.trim(), display_order: albums.length })
      setNewTitle('')
      await reload()
      setEditingId(album.id)
      notify('Project created')
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const j = index + delta
    if (j < 0 || j >= list.length) return
    const next = [...list]
    ;[next[index], next[j]] = [next[j], next[index]]
    setList(next)
    try {
      await api.reorderAlbums(next.map((a) => a.id))
      await reload()
    } catch (err) {
      notify(errorText(err), 'error')
      setList(albums)
    }
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1>Projects</h1>
        <p className="muted">Published projects appear on the home page in this order. A project shows once it has a published photo.</p>
      </div>

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <TextField label="New project" value={newTitle} onChange={setNewTitle} placeholder="e.g. Maison du Parc" />
        <button type="submit" className="btn btn--primary" disabled={creating || !newTitle.trim()}>
          Create project
        </button>
      </form>

      {list.length === 0 ? (
        <p className="empty">No projects yet.</p>
      ) : (
        <ol className="series-list">
          {list.map((album, i) => (
            <li key={album.id} className="series-row">
              <div className="series-row__summary">
                <Thumb src={album.cover_src} alt="" className="series-row__cover" />
                <div className="series-row__text">
                  <strong>{album.title}</strong>
                  <span className="muted">
                    {[album.architect, album.year].filter(Boolean).join(' · ')}
                    {album.architect || album.year ? ' · ' : ''}
                    {album.photo_count ?? 0} photos · {album.grid_ratio} grid · {album.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="series-row__actions">
                  <button type="button" className="btn btn--small" aria-label={`Move ${album.title} up`} disabled={i === 0} onClick={() => void move(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="btn btn--small" aria-label={`Move ${album.title} down`} disabled={i === list.length - 1} onClick={() => void move(i, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    aria-expanded={editingId === album.id}
                    onClick={() => setEditingId(editingId === album.id ? null : album.id)}
                  >
                    {editingId === album.id ? 'Close' : 'Edit'}
                  </button>
                </div>
              </div>
              {editingId === album.id && (
                <AlbumEditor
                  album={album}
                  onSaved={async () => {
                    await reload()
                  }}
                  onDeleted={async () => {
                    setEditingId(null)
                    await reload()
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function AlbumEditor({ album, onSaved, onDeleted }: { album: Album; onSaved: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const notify = useNotify()
  const [title, setTitle] = useState(album.title)
  const [year, setYear] = useState(album.year ? String(album.year) : '')
  const [description, setDescription] = useState(album.description)
  const [slug, setSlug] = useState(album.slug)
  const [architect, setArchitect] = useState(album.architect)
  const [location, setLocation] = useState(album.location)
  const [gridRatio, setGridRatio] = useState<GridRatio>(album.grid_ratio)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    api.photos({ album: album.id }).then(setPhotos, () => setPhotos([]))
  }, [album.id])

  async function save(change: Partial<Album>) {
    setBusy(true)
    setErrors({})
    try {
      await api.updateAlbum(album.id, change)
      await onSaved()
      notify('Saved')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      notify(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.deleteAlbum(album.id)
      notify('Project deleted. Its photos are now Unsorted.')
      await onDeleted()
    } catch (err) {
      notify(errorText(err), 'error')
      setBusy(false)
    }
  }

  const published = photos?.filter((p) => p.is_published) ?? []

  return (
    <div className="album-editor">
      <form
        className="album-editor__form"
        onSubmit={(e) => {
          e.preventDefault()
          void save({ title, slug, description, architect, location, grid_ratio: gridRatio, year: year ? Number(year) : null })
        }}
      >
        <TextField label="Title" value={title} onChange={setTitle} error={errors.title} required />
        <div className="field-row">
          <TextField label="Year" type="number" value={year} onChange={setYear} error={errors.year} />
          <TextField label="Web address" value={slug} onChange={setSlug} error={errors.slug} hint={`/series/${slug || '…'}`} />
        </div>
        <div className="field-row">
          <TextField label="Architect / practice" value={architect} onChange={setArchitect} error={errors.architect} />
          <TextField label="Location" value={location} onChange={setLocation} error={errors.location} />
        </div>
        <SelectField
          label="Grid shape"
          value={gridRatio}
          onChange={(v) => setGridRatio(v as GridRatio)}
          error={errors.grid_ratio}
          hint="Shape of the cells on the project page. Photos are fitted whole inside, never cut, unless you crop one."
          options={GRID_RATIOS.map((g) => ({ value: g.value, label: g.label }))}
        />
        <TextArea label="Introduction" value={description} onChange={setDescription} error={errors.description} rows={3} />
        <div className="album-editor__actions">
          <button type="submit" className="btn" disabled={busy}>
            Save
          </button>
          <Toggle label={album.is_published ? 'Published' : 'Draft'} checked={album.is_published} disabled={busy} onChange={(v) => void save({ is_published: v })} />
        </div>
      </form>

      <div className="cover-picker">
        <p className="field-label">Cover photo</p>
        <p className="field__hint">Home page covers are 3:4. Crop the chosen photo to 3:4 in Photos if you want it to fill the frame.</p>
        {photos === null ? (
          <p className="muted">Loading…</p>
        ) : published.length === 0 ? (
          <p className="field__hint">Publish a photo in this project to choose a cover. Until then the first published photo is used.</p>
        ) : (
          <ul className="cover-picker__grid" role="list">
            {published.map((p) => {
              const isCover = album.cover === p.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`cover-picker__item${isCover ? ' cover-picker__item--active' : ''}`}
                    aria-pressed={isCover}
                    aria-label={`Use ${p.title || 'this photo'} as cover`}
                    disabled={busy}
                    onClick={() => void save({ cover: isCover ? null : p.id })}
                  >
                    <Thumb src={p.src} alt="" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="editor__danger">
        {confirmDelete ? (
          <>
            <span>Delete this project? Its photos are kept and become Unsorted.</span>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void remove()}>
              Yes, delete project
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
            Delete project
          </button>
        )}
      </div>
    </div>
  )
}
