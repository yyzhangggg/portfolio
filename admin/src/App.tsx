import './App.css'

function App() {
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <span className="admin-mark">ZY / ADMIN</span>
        <span className="admin-state">SETUP IN PROGRESS</span>
      </header>
      <section className="admin-content">
        <p className="admin-eyebrow">CONTENT MANAGEMENT</p>
        <h1>Portfolio admin</h1>
        <p>
          This app will manage portfolio projects. The Django API is being set
          up; project editing and sign-in are not enabled yet.
        </p>
      </section>
    </main>
  )
}

export default App
