import { Link } from '../router'
import type { AlbumSummary } from '../types'
import { ResponsiveImage } from './ResponsiveImage'

export function SeriesGrid({ albums }: { albums: AlbumSummary[] }) {
  return (
    <section id="series" className="section container" aria-labelledby="series-heading">
      <div className="section__head">
        <h2 id="series-heading" className="display-2">
          Series
        </h2>
        <p className="muted">Each series opens into its own gallery.</p>
      </div>

      {albums.length === 0 ? (
        <p className="muted">New work is on its way.</p>
      ) : (
        <ul className="series-grid" role="list">
          {albums.map((album) => (
            <li key={album.slug}>
              <Link to={`/series/${encodeURIComponent(album.slug)}`} className="series-card">
                <div className="series-card__cover">
                  <ResponsiveImage
                    src={album.cover?.src}
                    alt={album.cover?.alt_text ?? ''}
                    width={album.cover?.width ?? 4}
                    height={album.cover?.height ?? 5}
                    sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 380px"
                  />
                </div>
                <span className="series-card__title">{album.title}</span>
                <span className="series-card__meta">
                  {album.year ? `${album.year} · ` : ''}
                  {album.photo_count} {album.photo_count === 1 ? 'photo' : 'photos'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
