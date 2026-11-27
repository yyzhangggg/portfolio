import { useEffect, useState } from 'react'

type State<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown }

// Results are kept for the session so going back to a page is instant.
const cache = new Map<string, unknown>()

/** Loads data for `key` once per session; re-runs when the key changes. */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>): State<T> {
  const [state, setState] = useState<State<T> & { key: string }>(() =>
    cache.has(key) ? { key, status: 'ready', data: cache.get(key) as T } : { key, status: 'loading' },
  )

  useEffect(() => {
    if (cache.has(key)) {
      setState({ key, status: 'ready', data: cache.get(key) as T })
      return
    }
    const controller = new AbortController()
    setState({ key, status: 'loading' })
    load(controller.signal).then(
      (data) => {
        cache.set(key, data)
        setState({ key, status: 'ready', data })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ key, status: 'error', error })
      },
    )
    return () => controller.abort()
    // `load` is expected to depend only on `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Never show the previous key's data while the new key loads.
  if (state.key !== key) return cache.has(key) ? { status: 'ready', data: cache.get(key) as T } : { status: 'loading' }
  return state
}
