import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { TextField } from '../components/Field'
import { errorText, useNotify } from '../notices'

/** Change password, and manage recovery codes for "Forgot password?". */
export function SecurityPanel() {
  return (
    <div className="panel-row">
      <ChangePassword />
      <RecoveryCodes />
    </div>
  )
}

function ChangePassword() {
  const notify = useNotify()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const mismatch = confirm.length > 0 && confirm !== next

  async function submit() {
    if (mismatch) return
    setBusy(true)
    setErrors({})
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      notify('Password changed. Other devices have been signed out.')
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      notify(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="pw-heading">
      <h2 id="pw-heading">Change password</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" error={errors.current_password} required />
        <TextField label="New password" type="password" value={next} onChange={setNext} autoComplete="new-password" error={errors.new_password} hint="At least 8 characters, not too common." required />
        <TextField
          label="Repeat new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={mismatch ? 'The passwords do not match.' : undefined}
          required
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !current || !next || mismatch}>
          Change password
        </button>
      </form>
    </section>
  )
}

function RecoveryCodes() {
  const notify = useNotify()
  const [remaining, setRemaining] = useState<number | null>(null)
  const [total, setTotal] = useState(10)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    api.recoveryCodes().then(
      (r) => {
        setRemaining(r.remaining)
        setTotal(r.total)
      },
      (err) => notify(errorText(err), 'error'),
    )
  }, [notify])

  async function regenerate() {
    setBusy(true)
    setError('')
    try {
      const r = await api.regenerateRecoveryCodes(password)
      setCodes(r.codes)
      setRemaining(r.remaining)
      setPassword('')
      setAsking(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.fields.password || err.message : errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!codes) return
    const text = `Recovery codes for the photography dashboard\nEach code works once. Keep this file somewhere safe.\n\n${codes.join('\n')}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copy() {
    if (!codes) return
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      notify('Codes copied')
    } catch {
      notify('Could not copy. Select the codes and copy them by hand.', 'error')
    }
  }

  const low = remaining !== null && remaining <= 3

  return (
    <section className="panel" aria-labelledby="codes-heading">
      <h2 id="codes-heading">Recovery codes</h2>
      <p className="field__hint">
        If you forget your password, one of these codes lets you set a new one from the sign-in page. Each code works once.
      </p>
      {remaining !== null && (
        <p className={low ? 'field__error' : ''}>
          {remaining} of {total} codes left{low ? ': make a new set soon.' : '.'}
        </p>
      )}

      {codes && (
        <div className="codes" role="region" aria-label="Your new recovery codes">
          <p>
            <strong>Save these now.</strong> They will not be shown again, and your old codes no longer work.
          </p>
          <ol className="codes__list">
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ol>
          <div className="editor__actions">
            <button type="button" className="btn btn--small" onClick={() => void copy()}>
              Copy
            </button>
            <button type="button" className="btn btn--small" onClick={download}>
              Download .txt
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => setCodes(null)}>
              I have saved them
            </button>
          </div>
        </div>
      )}

      {!codes &&
        (asking ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void regenerate()
            }}
          >
            <TextField
              label="Your password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              error={error}
              hint="Making new codes replaces all the old ones."
              required
            />
            <div className="editor__actions">
              <button type="submit" className="btn btn--primary" disabled={busy || !password}>
                Make new codes
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn" onClick={() => setAsking(true)}>
            {remaining === 0 ? 'Create recovery codes' : 'Make new recovery codes'}
          </button>
        ))}
    </section>
  )
}
