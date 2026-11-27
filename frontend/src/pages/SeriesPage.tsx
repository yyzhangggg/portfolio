import { useEffect } from 'react'
import { fetchAlbum, fetchSite, NotFoundError } from '../api'
import { Lightbox } from '../components/Lightbox'
import { FramedImage } from '../components/FramedImage'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { Link, navigate, useLocation } from '../router'
import { useResource } from '../useResource'
import { StatusPage } from './StatusPage'

export function SeriesPage({ slug }: { slug: string }) {
  const album = useResource(`album:${slug}`, (signal) => fetchAlbum(slug, signal))
  const site = useResource('site', fetchSite)
  const { pathname, search } = useLocation()
  const name = site.status === 'ready' ? site.data.photographer.display_name : ''

  useEffect(() => {
    if (album.status === 'ready' && name) document.title = `${album.data.title} — ${name}`
  }, [album, name])

  if (album.status === 'loading') return <StatusPage title="Loading…" message="" loading />
  if (album.status === 'error') {
    return album.error instanceof NotFoundError ? (
      <StatusPage title="Project not found" message="This project may have been moved or unpublished." />
    ) : (
      <StatusPage title="Something went wrong" message="The project could not be loaded. Please try again in a minute." />
    )
  }

  const { title, year, architect, location, grid_ratio, description, photos } = album.data
  // The open photo lives in the URL (?photo=<id>) so it can be shared and the
  // Back button closes the viewer.
  const openId = Number(search.get('photo'))
  const openIndex = photos.findIndex((p) => p.id === openId)

  const open = (index: number, replace = false) =>
    navigate(`${pathname}?photo=${photos[index].id}`, { replace, scroll: false })
  const close = () => navigate(pathname, { replace: true, scroll: false })

  return (
    <>
      <SiteHeader name={name} variant="solid" />
      <main className="container series-page">
        <Link to="/#series" className="back-link" scroll={false}>
          ← All projects
        </Link>
        <header className="series-page__head">
          <h1 className="display-1">{title}</h1>
          {(architect || location || year) && (
            <dl className="project-facts">
              {architect && (
                <div>
                  <dt>Architect</dt>
                  <dd>{architect}</dd>
                </div>
              )}
              {location && (
                <div>
                  <dt>Location</dt>
                  <dd>{location}</dd>
                </div>
              )}
              {year && (
                <div>
                  <dt>Year</dt>
                  <dd>{year}</dd>
                </div>
              )}
            </dl>
          )}
          {description && <p className="series-page__intro">{description}</p>}
        </header>

        <ul className="photo-grid" role="list">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button type="button" className="photo-grid__item" onClick={() => open(i)} aria-label={`Open ${photo.title || photo.alt_text}`}>
                <FramedImage
                  image={photo}
                  ratio={grid_ratio}
                  sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 380px"
                  eager={i < 6}
                />
              </button>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter name={name} />

      {openIndex >= 0 && (
        <Lightbox
          albumTitle={title}
          photos={photos}
          index={openIndex}
          onClose={close}
          onIndexChange={(i) => open(i, true)}
        />
      )}
    </>
  )
}
