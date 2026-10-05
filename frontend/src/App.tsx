import { sampleProjects } from './data/sampleProjects'
import './App.css'

function App() {
  return (
    <main className="portfolio">
      <nav className="topbar" aria-label="Main navigation">
        <a className="wordmark" href="#top">ZY / PORTFOLIO</a>
        <span className="topbar-note">Independent creative practice</span>
      </nav>

      <header className="intro" id="top">
        <p className="eyebrow">ARTIST · MUSICIAN · ARCHITECT</p>
        <h1>A space for work<br />and ideas.</h1>
        <p className="intro-copy">
          A sample portfolio for presenting selected projects, experiments, and
          the stories behind them.
        </p>
      </header>

      <section className="work" aria-labelledby="work-title">
        <div className="section-heading">
          <h2 id="work-title">Selected work</h2>
          <span>{String(sampleProjects.length).padStart(2, '0')} PROJECTS</span>
        </div>
        <div className="project-list">
          {sampleProjects.map((project, index) => (
            <article className="project" key={project.title}>
              <span className="project-number">0{index + 1}</span>
              <div className="project-copy">
                <h3>{project.title}</h3>
                <p>{project.description}</p>
              </div>
              <div className="project-meta">
                <span>{project.category}</span>
                <span>{project.year}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">SAMPLE CONTENT · REPLACE WITH YOUR OWN WORK</footer>
    </main>
  )
}

export default App
