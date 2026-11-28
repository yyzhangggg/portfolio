import { HomePage } from './pages/HomePage'
import { SeriesPage } from './pages/SeriesPage'
import { StatusPage } from './pages/StatusPage'
import { matchSeries, useLocation } from './router'
import './App.css'

function App() {
  const { pathname } = useLocation()
  if (pathname === '/' || pathname === '') return <HomePage />
  const slug = matchSeries(pathname)
  if (slug) return <SeriesPage key={slug} slug={slug} />
  return <StatusPage title="Page not found" message="There is nothing at this address." />
}

export default App
