import { useEffect, useState } from 'react'
import { api, ApiError, LIMITS, formatBytes, uploadFile, type Profile } from '../api'
import { TextArea, TextField } from '../components/Field'
import { FilePicker } from '../components/FilePicker'
import { Thumb } from '../components/Thumb'
import { errorText, useNotify } from '../notices'
import { Progress } from './HomepageView'
import { SecurityPanel } from './SecurityPanel'

type Draft = Omit<Profile, 'slug' | 'portrait'>

export function ProfileView({ onNameChanged }: { onNameChanged: (name: string) => void }) {
  const notify = useNotify()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)

  function adopt(p: Profile) {
    setProfile(p)
    setDraft({
      display_name: p.display_name,
      tagline: p.tagline,
      bio: p.bio,
      location: p.location,
      contact_email: p.contact_email,
      instagram_url: p.instagram_url,
      website_url: p.website_url,
      portrait_alt: p.portrait_alt,
    })
  }

  useEffect(() => {
    api.profile().then(adopt, (err) => notify(errorText(err), 'error'))
  }, [notify])

  async function save() {
    if (!draft) return
    setSaving(true)
    setErrors({})
    try {
      const p = await api.updateProfile(draft)
      adopt(p)
      onNameChanged(p.display_name)
      notify('Saved')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      notify(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function uploadPortrait(file: File) {
    if (file.type !== 'image/jpeg') return notify('The portrait must be a JPEG.', 'error')
    if (file.size > LIMITS.photoBytes) return notify(`Larger than ${formatBytes(LIMITS.photoBytes)}.`, 'error')
    try {
      setProgress(0)
      const key = await uploadFile('portrait', file, setProgress)
      adopt(await api.updateProfile({ portrait_key: key }))
      notify('Portrait updated')
    } catch (err) {
      notify(errorText(err), 'error')
    } finally {
      setProgress(null)
    }
  }

  if (!profile || !draft) return <p className="page muted">Loading…</p>
  const set = (field: keyof Draft) => (value: string) => setDraft((d) => (d ? { ...d, [field]: value } : d))

  return (
    <div className="page">
      <div className="page__head">
        <h1>About you</h1>
        <p className="muted">The “About the photographer” section on your home page.</p>
      </div>

      <div className="panel-row">
        <section className="panel" aria-labelledby="profile-text">
          <h2 id="profile-text">Your story</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <TextField label="Name" value={draft.display_name} onChange={set('display_name')} error={errors.display_name} required />
            <TextField label="Tagline (optional)" value={draft.tagline} onChange={set('tagline')} error={errors.tagline} />
            <TextArea
              label="Story"
              value={draft.bio}
              onChange={set('bio')}
              error={errors.bio}
              rows={9}
              hint="Leave a blank line between paragraphs."
            />
            <TextField label="Based in" value={draft.location} onChange={set('location')} error={errors.location} />
            <TextField label="Contact email" type="email" value={draft.contact_email} onChange={set('contact_email')} error={errors.contact_email} />
            <TextField label="Instagram link" type="url" value={draft.instagram_url} onChange={set('instagram_url')} error={errors.instagram_url} placeholder="https://instagram.com/…" />
            <TextField label="Other website" type="url" value={draft.website_url} onChange={set('website_url')} error={errors.website_url} />
            <button type="submit" className="btn btn--primary" disabled={saving}>
              Save
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="profile-portrait">
          <h2 id="profile-portrait">Portrait</h2>
          <Thumb src={profile.portrait} alt="Current portrait" size="medium" className="media-preview media-preview--portrait" />
          <TextField
            label="Portrait alt text"
            value={draft.portrait_alt}
            onChange={set('portrait_alt')}
            error={errors.portrait_alt}
            hint="Saved with the button on the left."
          />
          {progress !== null ? (
            <Progress label="Uploading portrait" value={progress} />
          ) : (
            <FilePicker
              accept="image/jpeg,.jpg,.jpeg"
              onFiles={([f]) => void uploadPortrait(f)}
              title={profile.portrait ? 'Replace the portrait' : 'Add a portrait'}
              hint="JPEG · shown in a 4:5 frame"
              buttonLabel="Choose image"
              compact
            />
          )}
        </section>
      </div>

      <div className="page__head">
        <h2 className="page__subhead">Sign-in and security</h2>
      </div>
      <SecurityPanel />
    </div>
  )
}
