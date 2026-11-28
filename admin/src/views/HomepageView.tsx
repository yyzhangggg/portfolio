import { useEffect, useState } from 'react'
import { api, ApiError, LIMITS, formatBytes, uploadFile, type Homepage } from '../api'
import { TextField } from '../components/Field'
import { FilePicker } from '../components/FilePicker'
import { Thumb } from '../components/Thumb'
import { errorText, useNotify } from '../notices'

const VIDEO_TYPES = ['video/mp4', 'video/webm']

export function HomepageView() {
  const notify = useNotify()
  const [home, setHome] = useState<Homepage | null>(null)
  const [headline, setHeadline] = useState('')
  const [subheadline, setSubheadline] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const [posterProgress, setPosterProgress] = useState<number | null>(null)
  const [confirmRemoveVideo, setConfirmRemoveVideo] = useState(false)

  useEffect(() => {
    api.homepage().then(
      (h) => {
        setHome(h)
        setHeadline(h.headline)
        setSubheadline(h.subheadline)
      },
      (err) => notify(errorText(err), 'error'),
    )
  }, [notify])

  async function saveText() {
    setSaving(true)
    setErrors({})
    try {
      setHome(await api.updateHomepage({ headline, subheadline }))
      notify('Saved')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      notify(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function uploadVideo(file: File) {
    if (!VIDEO_TYPES.includes(file.type)) return notify('Use an MP4 (H.264) or WebM video.', 'error')
    if (file.size > LIMITS.videoBytes) return notify(`The video is larger than ${formatBytes(LIMITS.videoBytes)}. Compress it first.`, 'error')
    try {
      setVideoProgress(0)
      const key = await uploadFile('hero_video', file, setVideoProgress)
      setHome(await api.updateHomepage({ hero_video_key: key }))
      notify('Video updated')
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setVideoProgress(null)
    }
  }

  async function removeVideo() {
    try {
      setHome(await api.updateHomepage({ hero_video_key: '' }))
      notify('Video removed. The poster is shown instead.')
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setConfirmRemoveVideo(false)
    }
  }

  async function uploadPoster(file: File) {
    if (file.type !== 'image/jpeg') return notify('The poster must be a JPEG.', 'error')
    if (file.size > LIMITS.photoBytes) return notify(`Larger than ${formatBytes(LIMITS.photoBytes)}.`, 'error')
    try {
      setPosterProgress(0)
      const key = await uploadFile('poster', file, setPosterProgress)
      setHome(await api.updateHomepage({ poster_key: key }))
      notify('Poster updated')
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setPosterProgress(null)
    }
  }

  if (!home) return <p className="page muted">Loading…</p>

  return (
    <div className="page">
      <div className="page__head">
        <h1>Homepage</h1>
        <p className="muted">The full-screen video and headline at the top of your site.</p>
      </div>

      <section className="panel" aria-labelledby="hero-text">
        <h2 id="hero-text">Headline</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void saveText()
          }}
        >
          <TextField label="Headline" value={headline} onChange={setHeadline} error={errors.headline} />
          <TextField label="Sub-line (optional)" value={subheadline} onChange={setSubheadline} error={errors.subheadline} />
          <button type="submit" className="btn btn--primary" disabled={saving}>
            Save
          </button>
        </form>
      </section>

      <div className="panel-row">
        <section className="panel" aria-labelledby="hero-video">
          <h2 id="hero-video">Background video</h2>
          {home.hero_video ? (
            <video className="media-preview" src={home.hero_video.url} muted loop playsInline autoPlay controls />
          ) : (
            <p className="empty">No video yet. Visitors see the poster image.</p>
          )}
          {videoProgress !== null ? (
            <Progress label="Uploading video" value={videoProgress} />
          ) : (
            <FilePicker
              accept="video/mp4,video/webm"
              onFiles={([f]) => void uploadVideo(f)}
              title={home.hero_video ? 'Replace the video' : 'Add a video'}
              hint={`MP4 (H.264) or WebM · up to ${formatBytes(LIMITS.videoBytes)} · 10–20 seconds, no sound needed`}
              buttonLabel="Choose video"
              compact
            />
          )}
          {home.hero_video &&
            (confirmRemoveVideo ? (
              <div className="editor__danger">
                <span>Remove the video?</span>
                <button type="button" className="btn btn--danger" onClick={() => void removeVideo()}>
                  Yes, remove
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmRemoveVideo(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn--danger-outline btn--small" onClick={() => setConfirmRemoveVideo(true)}>
                Remove video
              </button>
            ))}
        </section>

        <section className="panel" aria-labelledby="hero-poster">
          <h2 id="hero-poster">Poster image</h2>
          <p className="field__hint">Shown while the video loads, and instead of it for visitors who turn off motion.</p>
          <Thumb src={home.poster} alt="Current poster" size="medium" className="media-preview" />
          {posterProgress !== null ? (
            <Progress label="Uploading poster" value={posterProgress} />
          ) : (
            <FilePicker
              accept="image/jpeg,.jpg,.jpeg"
              onFiles={([f]) => void uploadPoster(f)}
              title={home.poster ? 'Replace the poster' : 'Add a poster'}
              hint="JPEG · a still frame from the video works well"
              buttonLabel="Choose image"
              compact
            />
          )}
        </section>
      </div>
    </div>
  )
}

export function Progress({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div className="progress">
      <span>
        {label}… {value >= 1 ? 'processing' : `${pct}%`}
      </span>
      <div className="upload__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
