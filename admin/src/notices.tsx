import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Notice = { id: number; text: string; tone: 'ok' | 'error' }
type Notify = (text: string, tone?: Notice['tone']) => void

const NoticeContext = createContext<Notify>(() => {})

let nextId = 1

/** Small status messages in the corner ("Saved", errors), announced to screen readers. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])

  const notify = useCallback<Notify>((text, tone = 'ok') => {
    const id = nextId++
    setNotices((list) => [...list.slice(-3), { id, text, tone }])
    window.setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), tone === 'error' ? 8000 : 3500)
  }, [])

  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div className="notices" role="status" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice notice--${n.tone}`}>
            {n.text}
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  )
}

export function useNotify(): Notify {
  return useContext(NoticeContext)
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}
