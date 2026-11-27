import type { Photographer } from '../types'
import { ResponsiveImage } from './ResponsiveImage'

export function AboutSection({ photographer }: { photographer: Photographer }) {
  const { portrait } = photographer
  const portraitSize = portrait?.src.large ?? portrait?.src.medium
  const links = [
    photographer.instagram_url && { href: photographer.instagram_url, label: 'Instagram ↗', external: true },
    photographer.website_url && { href: photographer.website_url, label: 'Website ↗', external: true },
    photographer.contact_email && { href: `mailto:${photographer.contact_email}`, label: photographer.contact_email, external: false },
  ].filter((l): l is { href: string; label: string; external: boolean } => Boolean(l))

  return (
    <section id="about" className="about" aria-labelledby="about-heading">
      <div className="container about__inner">
        <div className="about__portrait">
          <ResponsiveImage
            src={portrait?.src}
            alt={portrait?.alt_text || `Portrait of ${photographer.display_name}`}
            width={portraitSize?.width ?? 4}
            height={portraitSize?.height ?? 5}
            sizes="(max-width: 900px) 100vw, 520px"
            from="medium"
          />
        </div>
        <div className="about__text">
          <span className="eyebrow">About the photographer</span>
          <h2 id="about-heading" className="display-2">
            {photographer.display_name}
          </h2>
          {photographer.tagline && <p className="about__tagline">{photographer.tagline}</p>}
          {photographer.bio_paragraphs.map((p, i) => (
            <p key={i} className="about__bio">
              {p}
            </p>
          ))}
          <div id="contact" className="about__links">
            {photographer.location && <span>Based in {photographer.location}</span>}
            {links.map((l) => (
              <a key={l.href} href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
