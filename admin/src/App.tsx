import { useCallback, useEffect, useState } from 'react'
import { api, type Album, type Me } from './api'
import { NoticeProvider, errorText, useNotify } from './notices'
import { HomepageView } from './views/HomepageView'
import { LibraryView } from './views/LibraryView'
import { LoginView } from './views/LoginView'
import { ProfileView } from './views/ProfileView'
import { SeriesView } from './views/SeriesView'
import './App.css'

type Tab = 'library' | 'series' | 'homepage' | 'profile'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'library', label: 'Photos' },
  { id: 'series', label: 'Series' },
  { id: 'homepage', label: 'Homepage' },
  { id: 'profile', label: 'About you' },
]

// Link for "View site". Set VITE_PUBLIC_SITE_URL on Vercel; locally it is the
// public site's dev server.
const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? 'http://localhost:5173'

function tabFromHash(): Tab {
  const id = window.location.hash.slice(1)
  return TABS.some((t) => t.id === id) ? (id as Tab) : 'library'
}

function Dashboard({ me, onLoggedOut }: { me: Extract<Me, { authenticated: true }>; onLoggedOut: () => void }) {
  const notify = useNotify()
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [albums, setAlbums] = useState<Album[]>([])
  const [name, setName] = useState(me.photographer.display_name)

  const loadAlbums = useCallback(async () => {
    try {
      setAlbums(await api.albums())
    } catch (err) {
      notify(errorText(err), 'error')
    }
  }, [notify])

  useEffect(() => {
    void loadAlbums()
  }, [loadAlbums])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  async function logout() {
    try {
      await api.logout()
    } finally {
      onLoggedOut()
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <strong>{name}</strong>
          <span className="tag">dashboard</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={`tab${tab === t.id ? ' tab--active' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="topbar__actions">
          <a className="btn btn--ghost" href={PUBLIC_SITE_URL} target="_blank" rel="noopener noreferrer">
            View site ↗
          </a>
          <button type="button" className="btn" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      {tab === 'library' && <LibraryView albums={albums} onAlbumsChanged={() => void loadAlbums()} />}
      {tab === 'series' && <SeriesView albums={albums} reload={loadAlbums} />}
      {tab === 'homepage' && <HomepageView />}
      {tab === 'profile' && <ProfileView onNameChanged={setName} />}
    </div>
  )
}

function Root() {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.me().then(setMe, (err) => setError(errorText(err)))
  }, [])

  if (error) {
    return (
      <main className="login">
        <div className="login__card">
          <h1>Can’t reach the server</h1>
          <p className="muted">{error} The server may be waking up; this can take about a minute. Try again shortly.</p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </main>
    )
  }
  if (!me) return <p className="boot muted">Loading…</p>
  if (!me.authenticated) return <LoginView onLoggedIn={setMe} />
  return <Dashboard me={me} onLoggedOut={() => setMe({ authenticated: false })} />
}

export default function App() {
  return (
    <NoticeProvider>
      <Root />
    </NoticeProvider>
  )
}
