import { Link } from '../router'

type Props = { title: string; message: string; loading?: boolean }

export function StatusPage({ title, message, loading }: Props) {
  return (
    <main className="status-page" aria-busy={loading || undefined}>
      <div className="container">
        <h1 className="display-2">{title}</h1>
        <p className="muted">{message}</p>
        {!loading && (
          <Link to="/" className="button button--outline">
            Back to the home page
          </Link>
        )}
      </div>
    </main>
  )
}
