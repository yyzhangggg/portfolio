import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Homepage } from '../types'

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return reduced
}

type Props = {
  homepage: Homepage
  /** The site header, layered on top of the video. */
  header: ReactNode
}

/**
 * Full-screen hero: background video under a dark overlay and a bottom fade,
 * with the header, headline and controls layered on top. With reduced motion
 * (or no video) the poster image is shown instead.
 */
export function HeroVideo({ homepage, header }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const poster = homepage.poster?.large ?? homepage.poster?.medium
  const showVideo = Boolean(homepage.hero_video) && !reducedMotion

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setPaused(false)
    } else {
      video.pause()
      setPaused(true)
    }
  }

  return (
    <section className="hero" aria-label="Introduction">
      <div className="hero__media" aria-hidden="true">
        {showVideo && homepage.hero_video ? (
          <video
            ref={videoRef}
            className="hero__video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={poster?.url}
            onPause={() => setPaused(true)}
            onPlay={() => setPaused(false)}
          >
            <source src={homepage.hero_video.url} type={homepage.hero_video.type || 'video/mp4'} />
          </video>
        ) : poster ? (
          <img className="hero__video" src={poster.url} alt="" />
        ) : (
          <div className="hero__video image-placeholder" />
        )}
        <div className="hero__overlay" />
        <div className="hero__fade" />
      </div>

      {header}

      <div className="hero__content">
        <div className="container hero__content-inner">
          <div>
            <h1 className="hero__headline">{homepage.headline}</h1>
            {homepage.subheadline && <p className="hero__sub">{homepage.subheadline}</p>}
          </div>
          <div className="hero__actions">
            <a className="button button--light" href="#series">
              View projects
            </a>
            {showVideo && (
              <button
                type="button"
                className="icon-button icon-button--glass"
                onClick={togglePlayback}
                aria-label={paused ? 'Play background video' : 'Pause background video'}
              >
                {paused ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M4 2.5v9l7.5-4.5z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M4.5 2.5v9M9.5 2.5v9" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
