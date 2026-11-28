import { useState } from 'react'
import { api, type Me } from '../api'
import { TextField } from '../components/Field'
import { errorText } from '../notices'

export function LoginView({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
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
    <main className="login">
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
      </form>
    </main>
  )
}
