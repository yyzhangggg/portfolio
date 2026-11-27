import { useRef, useState, type DragEvent, type ReactNode } from 'react'

type Props = {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  title: string
  hint: ReactNode
  buttonLabel?: string
  disabled?: boolean
  compact?: boolean
}

/** A drop zone with a real "Choose files" button for keyboard and touch users. */
export function FilePicker({ accept, multiple, onFiles, title, hint, buttonLabel = 'Choose files', disabled, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOver(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }

  return (
    <div
      className={`dropzone${over ? ' dropzone--over' : ''}${compact ? ' dropzone--compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <div className="dropzone__text">
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
      </div>
      <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {buttonLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files: File[] = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </div>
  )
}
