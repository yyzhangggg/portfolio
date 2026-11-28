import { useRef, useState } from 'react'
import { api, LIMITS, formatBytes, uploadFile, type Photo } from '../api'
import { FilePicker } from '../components/FilePicker'
import { errorText } from '../notices'

type Item = {
  id: number
  name: string
  size: number
  progress: number
  status: 'waiting' | 'uploading' | 'processing' | 'done' | 'error'
  error?: string
}

// One at a time: the free API server processes each photo before the next.
const CONCURRENCY = 1
let nextId = 1

function isJpeg(file: File) {
  return file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name)
}

type Props = {
  /** Project new uploads go into, or null for Unsorted. */
  albumId: number | null
  albumLabel: string
  onUploaded: (photo: Photo) => void
}

/** Drag-and-drop multi-upload: straight to storage, then confirmed one by one. */
export function UploadQueue({ albumId, albumLabel, onUploaded }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const queue = useRef<Array<{ item: Item; file: File; albumId: number | null }>>([])
  const running = useRef(0)

  const patch = (id: number, change: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)))

  function pump() {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      const job = queue.current.shift()!
      running.current += 1
      void run(job).finally(() => {
        running.current -= 1
        pump()
      })
    }
  }

  async function run({ item, file, albumId: target }: { item: Item; file: File; albumId: number | null }) {
    try {
      patch(item.id, { status: 'uploading' })
      const key = await uploadFile('photo', file, (p) => patch(item.id, { progress: p }))
      patch(item.id, { status: 'processing', progress: 1 })
      const photo = await api.confirmPhoto({ key, album: target, original_filename: file.name })
      patch(item.id, { status: 'done' })
      onUploaded(photo)
    } catch (err) {
      patch(item.id, { status: 'error', error: errorText(err) })
    }
  }

  function addFiles(files: File[]) {
    const added: Item[] = []
    for (const file of files) {
      const item: Item = { id: nextId++, name: file.name, size: file.size, progress: 0, status: 'waiting' }
      if (!isJpeg(file)) {
        item.status = 'error'
        item.error = 'Only JPEG files can be uploaded.'
      } else if (file.size > LIMITS.photoBytes) {
        item.status = 'error'
        item.error = `Larger than ${formatBytes(LIMITS.photoBytes)}.`
      } else {
        // Some systems report an empty type for .jpg; send the right one.
        const typed = file.type ? file : new File([file], file.name, { type: 'image/jpeg' })
        queue.current.push({ item, file: typed, albumId })
      }
      added.push(item)
    }
    setItems((list) => [...list.filter((i) => i.status !== 'done'), ...added])
    pump()
  }

  const active = items.some((i) => i.status === 'uploading' || i.status === 'processing' || i.status === 'waiting')

  return (
    <section className="uploads" aria-label="Upload photos">
      <FilePicker
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        onFiles={addFiles}
        title={`Drop photos here to upload to ${albumLabel}`}
        hint={`JPEG only · up to ${formatBytes(LIMITS.photoBytes)} each · new photos start as drafts`}
      />
      {items.length > 0 && (
        <ul className="uploads__list" role="list">
          {items.map((i) => (
            <li key={i.id} className={`upload upload--${i.status}`}>
              <div className="upload__row">
                <span className="upload__name">{i.name}</span>
                <span className="upload__status">
                  {i.status === 'waiting' && 'Waiting'}
                  {i.status === 'uploading' && `${Math.round(i.progress * 100)}%`}
                  {i.status === 'processing' && 'Processing…'}
                  {i.status === 'done' && 'Done · add alt text to publish'}
                  {i.status === 'error' && i.error}
                </span>
              </div>
              <div className="upload__bar" aria-hidden="true">
                <div style={{ width: `${Math.round((i.status === 'error' ? 1 : i.progress) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && !active && (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setItems([])}>
          Clear list
        </button>
      )}
    </section>
  )
}
