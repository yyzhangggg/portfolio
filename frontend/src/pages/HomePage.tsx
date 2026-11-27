import { useEffect } from 'react'
import { fetchSite } from '../api'
import { AboutSection } from '../components/AboutSection'
import { HeroVideo } from '../components/HeroVideo'
import { SeriesGrid } from '../components/SeriesGrid'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { scrollToHash } from '../router'
import { useResource } from '../useResource'
import { StatusPage } from './StatusPage'

export function HomePage() {
  const site = useResource('site', fetchSite)
  const ready = site.status === 'ready'

  // Arriving at "/#series" or "/#about": scroll once the content exists.
  useEffect(() => {
    if (ready) scrollToHash()
  }, [ready])

  useEffect(() => {
    if (site.status === 'ready') document.title = `${site.data.photographer.display_name} — Architecture Photography`
  }, [site])

  if (site.status === 'loading') return <StatusPage title="Loading…" message="" loading />
  if (site.status === 'error') {
    return <StatusPage title="Something went wrong" message="The gallery could not be loaded. Please try again in a minute." />
  }

  const { photographer, homepage, albums } = site.data
  return (
    <>
      <HeroVideo homepage={homepage} header={<SiteHeader name={photographer.display_name} variant="overlay" />} />
      <main>
        <SeriesGrid albums={albums} />
        <AboutSection photographer={photographer} />
      </main>
      <SiteFooter name={photographer.display_name} />
    </>
  )
}
