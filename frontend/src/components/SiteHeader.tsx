import { Link } from '../router'

type Props = {
  name: string
  /** "overlay" floats over the hero video; "solid" sits on the page. */
  variant: 'overlay' | 'solid'
}

export function SiteHeader({ name, variant }: Props) {
  return (
    <header className={`site-header site-header--${variant}`}>
      <div className="container site-header__inner">
        <Link to="/" className="wordmark">
          {name}
        </Link>
        <nav aria-label="Main" className="site-nav">
          <Link to="/#series" scroll={false}>
            Projects
          </Link>
          <Link to="/#about" scroll={false}>
            About
          </Link>
          <Link to="/#contact" scroll={false}>
            Contact
          </Link>
        </nav>
      </div>
    </header>
  )
}
