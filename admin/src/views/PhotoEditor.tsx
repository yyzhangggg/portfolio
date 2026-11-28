import { useEffect, useState } from 'react'
import { api, ApiError, formatBytes, type Album, type Photo } from '../api'
import { SelectField, TextArea, TextField } from '../components/Field'
import { Thumb } from '../components/Thumb'
import { errorText, useNotify } from '../notices'

type Props = {
  photo: Photo
  albums: Album[]
  canMove: { earlier: boolean; later: boolean }
  onMove: (delta: -1 | 1) => void
  onSaved: (photo: Photo) => void
  onDeleted: (id: number) => void
  onClose: () => void
}

type Draft = Pick<Photo, 'title' | 'caption' | 'alt_text' | 'location'> & { album: string }

const toDraft = (p: Photo): Draft => ({
  title: p.title,
  caption: p.caption,
  alt_text: p.alt_text,
  location: p.location,
  album: p.album == null ? '' : String(p.album),
})

export function PhotoEditor({ photo, albums, canMove, onMove, onSaved, onDeleted, onClose }: Props) {
  const notify = useNotify()
  const [draft, setDraft] = useState<Draft>(() => toDraft(photo))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setDraft(toDraft(photo))
    setErrors({})
    setConfirmDelete(false)
  }, [photo])

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(photo))
  const set = (field: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }))

  async function save(extra: Partial<Photo> = {}) {
    setBusy(true)
    setErrors({})
    try {
      const updated = await api.updatePhoto(photo.id, {
        title: draft.title,
        caption: draft.caption,
        alt_text: draft.alt_text,
        location: draft.location,
        album: draft.album === '' ? null : Number(draft.album),
        ...extra,
      })
      onSaved(updated)
      notify(extra.is_published === true ? 'Published' : extra.is_published === false ? 'Moved to drafts' : 'Saved')
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
      await api.deletePhoto(photo.id)
      onDeleted(photo.id)
      notify('Photo deleted')
    } catch (err) {
      notify(errorText(err), 'error')
      setBusy(false)
    }
  }

  const exif = [photo.camera, photo.lens, photo.focal_length, photo.aperture, photo.shutter_speed, photo.iso && `ISO ${photo.iso}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside className="editor" aria-labelledby="editor-heading">
      <div className="editor__head">
        <h2 id="editor-heading">Edit photo</h2>
        <button type="button" className="btn btn--ghost btn--icon" aria-label="Close editor" onClick={onClose}>
          ×
        </button>
      </div>

      <Thumb src={photo.src} alt={photo.alt_text} size="medium" className="editor__preview" />
      <p className="field__hint">
        {photo.original_filename || 'Original'} · {photo.width}×{photo.height} · {formatBytes(photo.file_size)}
      </p>

      <form
        className="editor__form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label="Title" value={draft.title} onChange={set('title')} error={errors.title} />
        <TextArea
          label="Alt text"
          value={draft.alt_text}
          onChange={set('alt_text')}
          error={errors.alt_text}
          hint="Required to publish. Describe what is in the photo for people using screen readers."
          placeholder="e.g. Fishing boats moored in fog at dawn"
        />
        <TextArea label="Caption" value={draft.caption} onChange={set('caption')} error={errors.caption} rows={2} />
        <TextField label="Location" value={draft.location} onChange={set('location')} error={errors.location} />
        <SelectField
          label="Series"
          value={draft.album}
          onChange={set('album')}
          error={errors.album}
          options={[{ value: '', label: 'Unsorted' }, ...albums.map((a) => ({ value: String(a.id), label: a.title }))]}
        />

        {exif && <p className="editor__exif">From the camera: {exif}. GPS location is never published.</p>}

        <div className="editor__actions">
          <button type="submit" className="btn" disabled={busy || !dirty}>
            Save
          </button>
          {photo.is_published ? (
            <button type="button" className="btn" disabled={busy} onClick={() => void save({ is_published: false })}>
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !draft.alt_text.trim()}
              title={draft.alt_text.trim() ? undefined : 'Add alt text first'}
              onClick={() => void save({ is_published: true })}
            >
              Publish
            </button>
          )}
        </div>
      </form>

      {(canMove.earlier || canMove.later) && (
        <div className="editor__order">
          <span className="field__hint">Order in series</span>
          <button type="button" className="btn btn--small" disabled={!canMove.earlier} onClick={() => onMove(-1)}>
            ← Earlier
          </button>
          <button type="button" className="btn btn--small" disabled={!canMove.later} onClick={() => onMove(1)}>
            Later →
          </button>
        </div>
      )}

      <div className="editor__danger">
        {confirmDelete ? (
          <>
            <span>Delete this photo and its files for good?</span>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void remove()}>
              Yes, delete
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmDelete(true)}>
            Delete photo
          </button>
        )}
      </div>
    </aside>
  )
}
