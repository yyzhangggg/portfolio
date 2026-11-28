export function SiteFooter({ name }: { name: string }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <span>
          © {new Date().getFullYear()} {name}
        </span>
        <span>All photographs © the artist</span>
      </div>
    </footer>
  )
}
