import { useState } from 'react'
import { api, ApiError, type Me } from '../api'
import { TextField } from '../components/Field'
import { errorText, useNotify } from '../notices'

export function LoginView({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'recover'>('login')
  return (
    <main className="login">
      {mode === 'login' ? (
        <LoginForm onLoggedIn={onLoggedIn} onForgot={() => setMode('recover')} />
      ) : (
        <RecoverForm onLoggedIn={onLoggedIn} onBack={() => setMode('login')} />
      )}
    </main>
  )
}

function LoginForm({ onLoggedIn, onForgot }: { onLoggedIn: (me: Me) => void; onForgot: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      onLoggedIn(await api.login(username, password))
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <form
      className="login__card"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h1>Sign in</h1>
      <p className="muted">Manage the photos on your site.</p>
      <TextField label="Username" value={username} onChange={setUsername} autoComplete="username" required />
      <TextField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy || !username || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" className="btn btn--ghost btn--block login__alt" onClick={onForgot}>
        Forgot password?
      </button>
    </form>
  )
}

function RecoverForm({ onLoggedIn, onBack }: { onLoggedIn: (me: Me) => void; onBack: () => void }) {
  const notify = useNotify()
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== password

  async function submit() {
    if (mismatch) return
    setBusy(true)
    setErrors({})
    try {
      const me = await api.recover(username, code, password)
      const left = me.recovery_codes_left
      notify(
        left !== undefined && left <= 3
          ? `Password changed. Only ${left} recovery codes left: make new ones in About you.`
          : 'Password changed.',
        left !== undefined && left <= 3 ? 'error' : 'ok',
      )
      onLoggedIn(me)
    } catch (err) {
      setErrors(err instanceof ApiError ? { ...err.fields, detail: err.message } : { detail: errorText(err) })
      setBusy(false)
    }
  }

  return (
    <form
      className="login__card"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h1>Reset password</h1>
      <p className="muted">Use one of the recovery codes you saved when your account was set up. Each code works once.</p>
      <TextField label="Username" value={username} onChange={setUsername} autoComplete="username" required />
      <TextField
        label="Recovery code"
        value={code}
        onChange={setCode}
        placeholder="XXXX-XXXX-XXXX"
        autoComplete="one-time-code"
        required
      />
      <TextField
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        error={errors.new_password}
        hint="At least 8 characters, not too common."
        required
      />
      <TextField
        label="Repeat new password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        error={mismatch ? 'The passwords do not match.' : undefined}
        required
      />
      {errors.detail && !errors.new_password && (
        <p className="field__error" role="alert">
          {errors.detail}
        </p>
      )}
      <button type="submit" className="btn btn--primary btn--block" disabled={busy || !username || !code || !password || mismatch}>
        {busy ? 'Resetting…' : 'Reset password and sign in'}
      </button>
      <button type="button" className="btn btn--ghost btn--block login__alt" onClick={onBack}>
        Back to sign in
      </button>
      <p className="field__hint login__note">No codes left? Ask the person who maintains the site to reset it for you.</p>
    </form>
  )
}
