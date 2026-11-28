import { Link } from '../router'
import type { AlbumSummary } from '../types'
import { FramedImage } from './FramedImage'

export function SeriesGrid({ albums }: { albums: AlbumSummary[] }) {
  return (
    <section id="series" className="section container" aria-labelledby="series-heading">
      <div className="section__head">
        <h2 id="series-heading" className="display-2">
          Projects
        </h2>
        <p className="muted">Each project opens into its own gallery.</p>
      </div>

      {albums.length === 0 ? (
        <p className="muted">New work is on its way.</p>
      ) : (
        <ul className="series-grid" role="list">
          {albums.map((album) => (
            <li key={album.slug}>
              <Link to={`/series/${encodeURIComponent(album.slug)}`} className="series-card">
                {/* Covers share one shape on the home page; a 3:4 crop in the dashboard fills it exactly. */}
                <FramedImage
                  image={album.cover}
                  ratio="3:4"
                  alt={album.cover?.alt_text ?? ''}
                  sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 380px"
                />
                <span className="series-card__title">{album.title}</span>
                <span className="series-card__meta">
                  {[album.architect, album.location, album.year].filter(Boolean).join(' · ') ||
                    `${album.photo_count} ${album.photo_count === 1 ? 'photo' : 'photos'}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
