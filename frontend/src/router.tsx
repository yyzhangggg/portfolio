import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

// A tiny History-API router: the site has only a few routes, so it does not
// need a routing library.

const NAV_EVENT = 'portfolio:navigate'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAV_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAV_EVENT, onChange)
  }
}

const getLocation = () => window.location.pathname + window.location.search

/** Re-renders on navigation; returns pathname + search. */
export function useLocation(): { pathname: string; search: URLSearchParams } {
  const loc = useSyncExternalStore(subscribe, getLocation)
  const url = new URL(loc, window.location.origin)
  return { pathname: url.pathname, search: url.searchParams }
}

export function navigate(to: string, { replace = false, scroll = true } = {}) {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAV_EVENT))
  const hash = new URL(to, window.location.origin).hash
  if (hash) requestAnimationFrame(() => scrollToHash(hash))
  else if (scroll) window.scrollTo({ top: 0 })
}

/** Scrolls to the element named by a "#id" hash, if it is on the page. */
export function scrollToHash(hash = window.location.hash): boolean {
  if (!hash || hash.length < 2) return false
  const el = document.getElementById(decodeURIComponent(hash.slice(1)))
  if (!el) return false
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  return true
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; scroll?: boolean }

export function Link({ to, scroll = true, onClick, ...rest }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to, { scroll })
  }
  return <a href={to} onClick={handleClick} {...rest} />
}

/** Matches "/series/:slug". */
export function matchSeries(pathname: string): string | null {
  const m = /^\/series\/([^/]+)\/?$/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}
