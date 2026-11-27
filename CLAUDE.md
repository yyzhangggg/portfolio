# CLAUDE.md — Photography Portfolio

Planning and architecture document for turning this repo into a personal photography website with a self-service admin dashboard.

## Goal

- Public site: showcase photos organized into albums/series.
- Admin dashboard on its own subdomain: log in, upload, organize, edit, publish and delete photos without touching code.
- Single owner for now (Yanying). The data model must allow a second photographer (a friend) to be added later without restructuring.
- Run at $0/month to start.

## Collaboration rules for Claude

- Do not write or change code unless the user explicitly says "生成代码" / "write code" / "generate code". Without that trigger, discuss in plain text.
- Planning documents (this file, READMEs, architecture notes) may be updated freely.
- Only the `portfolio` repo is in scope. Do not touch the user's other repos (price-tracker, FunSKillsFactory, ref-free-qc, TicBridge, skills).

## Current state of the repo (as of 2026-11-27)

- `frontend/` — Vite + React 19 + TypeScript public site; shows hard-coded sample data from `src/data/sampleProjects.ts`.
- `admin/` — Vite + React + TypeScript app; placeholder only, no login or editing.
- `backend/` — Django 5.2 + Django REST Framework. App `projects` with models `Project` and `ProjectImage` (image stored only as a URL). SQLite. Settings read from a root `.env` via python-dotenv.
- No real file upload, no object storage, no auth for a custom admin, no deployment config.

## Target architecture

| Piece | Service | Notes |
|---|---|---|
| Public site (`frontend/`) | Vercel project #1 | Static build |
| Admin dashboard (`admin/`) | Vercel project #2 | Separate deployment = separate subdomain |
| API (`backend/`) | Render web service (Free) | Django + DRF + gunicorn |
| Database | Neon Postgres (Free) | Replaces SQLite in production |
| Photo files | Cloudflare R2 (Free tier) | S3-compatible; served via R2 public bucket URL or custom domain |

### Why not SQLite or local files in production

Render Free web services have an ephemeral filesystem: anything written to disk (SQLite file, uploaded images) is lost on redeploy, restart or spin-down. All persistent state must live in Neon (data) and R2 (files). SQLite stays for local development only.

### Free-tier constraints to remember

- Render Free spins down after 15 minutes without traffic; the next request takes about a minute to wake. Mitigation: a free external pinger (e.g. cron-job.org) hitting a lightweight health endpoint every ~10 minutes, or upgrade that one service to the paid Starter instance later.
- Render Free Postgres expires after 30 days, so it is not used; Neon is the database.
- Neon Free: 1 GB storage per project, compute scales to zero when idle (fast resume).
- R2 Free: 10 GB storage per month, zero egress fees.
- Verify these limits on the providers' pricing pages before relying on them; they change.

## Domains and the admin subdomain

### Phase A — no custom domain yet

- Public site: `<name>.vercel.app`
- Admin: `<name>-admin.vercel.app` (second Vercel project)
- API: `<name>.onrender.com`

### Phase B — after buying a domain (e.g. via Cloudflare Registrar)

- `example.com` and `www.example.com` → Vercel project #1 (public)
- `admin.example.com` → Vercel project #2 (admin)
- `api.example.com` → Render (optional; see auth below)
- `photos.example.com` → R2 bucket custom domain (optional, nicer image URLs + Cloudflare caching)

DNS lives in Cloudflare; each subdomain is a CNAME pointing to the respective provider. Vercel and Render both issue HTTPS certificates automatically.

### Auth and cookies across domains (the key decision)

Problem: the admin (on vercel.app) and the API (on onrender.com) are different sites. Cross-site session cookies require SameSite=None and are increasingly blocked by browsers (Safari especially), so a naive Django-session login from the admin would be unreliable.

Chosen approach: **Vercel rewrites as a same-origin proxy.**

- In the admin Vercel project, configure a rewrite so that requests to `/api/*` on the admin's own domain are forwarded to the Render API.
- From the browser's point of view, the admin and the API are the same origin. Django session cookies and CSRF work as first-party cookies, with no CORS configuration needed for the admin.
- Works identically in Phase A (vercel.app) and Phase B (custom domain), so nothing changes when the domain is bought.
- The public site can use the same rewrite pattern for its read-only API calls, or call the API directly with CORS restricted to GET.

Caveat: large uploads should not go through this proxy (Vercel limits request body size and the Render free instance is slow). See "Upload flow" below — files go directly from the browser to R2, so only small JSON requests pass through the proxy.

Fallback if the proxy approach causes problems: token auth (e.g. djangorestframework-simplejwt) with short-lived access tokens kept in memory and a refresh token in an httpOnly cookie.

## Data model (target)

All content belongs to an owner so a second photographer can be added later.

**User** — Django's built-in user. Each photographer is a user; only staff/owners can log into the admin.

**PhotographerProfile** (one per user)
- user (one-to-one)
- slug (used in public URLs later, e.g. `/u/<slug>`)
- display name, bio, avatar, contact links

**Album** (replaces `Project`)
- owner → User
- title, slug (unique per owner), description
- cover photo (optional → Photo)
- is_published, display_order
- created_at, updated_at

**Photo** (replaces `ProjectImage`)
- owner → User
- album → Album (nullable, so a photo can sit in an "unsorted" pool)
- storage key of the original in R2
- storage keys of generated variants (thumbnail, medium, large; WebP)
- width, height (needed for layout without content shift)
- title, caption, alt text (required for accessibility before publishing)
- taken_at, location (optional, free text)
- EXIF fields (camera, lens, focal length, aperture, shutter speed, ISO) — extracted on upload; GPS stripped by default for privacy
- is_published, display_order
- created_at, updated_at

**HomepageSettings** (one per owner; drives the home page hero)
- owner → User (one-to-one)
- hero video: storage key in R2 (MP4/H.264, optional WebM), duration, size
- hero poster image: storage key (shown while the video loads, and to users with reduced-motion enabled)
- hero headline and optional sub-line
- featured series (ordered list of Albums shown on the home page)

Migration path: rename/replace the existing `projects` app models; existing data is sample-only, so a clean migration is acceptable.

## API (DRF)

Public, read-only, published content only:
- list published albums (optionally filtered by owner slug)
- album detail with its published photos
- photo detail
- photographer profile

Admin, authenticated, scoped to the logged-in owner's content:
- login / logout / current-user (session-based)
- CRUD for albums
- CRUD for photos (metadata edits, publish toggle, move between albums)
- bulk reorder (albums, photos within an album)
- bulk actions (publish/unpublish/delete several photos)
- request an upload URL (see below)
- confirm an upload (creates the Photo record and triggers processing)
- read / update homepage settings (headline, featured series order)
- request an upload URL for the hero video or poster, then confirm it (same presigned flow as photos)
- health endpoint for the keep-alive pinger

Permissions: every admin query is filtered by `owner = request.user`; no user can see or edit another user's drafts.

## Upload flow

1. Admin selects one or many files (drag-and-drop).
2. For each file, the admin asks the API for a presigned upload URL for R2.
3. Browser uploads the file directly to R2 (progress bar per file). The large file never touches Vercel or Render.
4. Admin calls "confirm upload"; API creates the Photo record (unpublished by default).
5. API generates resized WebP variants and reads EXIF. On the free tier this runs inline in the confirm request (acceptable for ~50 photos); move to a background job later if it gets slow.
6. Admin shows the new photos in an "unsorted / drafts" area to add alt text, captions and album, then publish.

Limits to enforce: accepted types (JPEG, PNG, HEIC→convert if feasible, WebP), max file size, max dimensions.

Hero video uploads use the same presigned direct-to-R2 flow. The server does not transcode video on the free tier, so the admin asks for an already-compressed file: MP4 (H.264), roughly 10–20 seconds, a few MB, no audio needed. Enforce a size cap and accepted types; a poster image is required alongside it.

## Admin dashboard (admin/) features

MVP:
- Login page
- Photo library grid with filters (album, published/draft)
- Drag-and-drop multi-upload with progress
- Photo edit panel: title, caption, alt text, album, publish toggle, delete
- Album management: create, rename, set cover, reorder, publish
- Drag to reorder photos within an album

- Homepage settings: upload/replace the hero video and poster, edit the headline, choose and order the featured series

Later:
- Bulk select actions
- Profile editor (bio, avatar, links)
- Simple stats (counts, storage used)
- Second user account for the friend

The Django built-in admin stays available for emergency maintenance, moved to an obscure path so it does not collide with or get confused with the custom dashboard.

## Public site (frontend/) features

Approved design (mockup: https://claude.ai/artifact/SQWVgGMUSuh3m69t8p9SiX): dark gallery look, serif display headings (Fraunces) over a sans body (Inter). No masonry anywhere.

Home page, top to bottom:
1. Full-screen hero video: autoplay, muted, loop, playsinline, with the poster image first. A semi-transparent dark overlay plus a bottom fade into the page. The site header/nav sits on top of the video. A large headline and a "View the series" button bottom-left, plus a visible pause/play button (required for accessibility). Respect prefers-reduced-motion: show the poster only.
2. Series gallery: one cover photo per series (4:5), with series title, year and photo count; each opens that series' gallery.
3. About the photographer: portrait photo on the left, name and story paragraphs on the right, then location and contact links; stacks vertically on phones.
4. Footer.

MVP:
- Home page as above
- Series page: an even grid of photos (uniform cells, not masonry) using stored width/height (no layout shift)
- Lightbox: full-screen view, keyboard and swipe navigation, caption and EXIF toggle
- About / Contact page
- Responsive images (thumbnail in grid, larger variant in lightbox) and lazy loading
- Accessibility: alt text on every image, keyboard-navigable lightbox, visible focus states, sufficient contrast

Later:
- Per-photographer pages (`/u/<slug>`) when the friend joins
- Open Graph images for sharing
- Optional watermark or right-click deterrent (note: cannot truly prevent copying)

## Configuration and secrets

Never commit secrets. Set in each provider's dashboard:
- Render: Django secret key, debug off, allowed hosts, Neon database URL, R2 account ID / access key / secret / bucket name / public base URL, CSRF trusted origins (admin and public domains).
- Vercel (both projects): API base path / rewrite target.
- Local: root `.env` (already git-ignored), SQLite allowed locally.

Backend production additions needed: gunicorn, a Postgres driver, a database-URL parser, django-storages with the S3 backend (pointed at R2), an image library for resizing and EXIF, and WhiteNoise (or equivalent) for Django's own static files.

## Roadmap

Phase 0 — Foundations
- Restructure models (Album, Photo, PhotographerProfile, owner fields)
- Postgres-ready settings; keep SQLite for local
- Public read-only API returning real data; frontend reads from the API instead of the sample file

Phase 1 — Storage and upload
- Create R2 bucket and keys
- Presigned upload + confirm endpoints
- Variant generation and EXIF extraction

Phase 2 — Admin MVP
- Session login via same-origin proxy
- Library, upload, edit, albums, reorder, publish

Phase 3 — Public site polish
- Gallery grid, lightbox, about page, accessibility pass, performance (lazy loading, correct sizes)

Phase 4 — Deploy
- Neon project, Render service, two Vercel projects with rewrites, keep-alive pinger
- Smoke test: upload from the admin on phone and laptop, verify on the public site

Phase 5 — Domain and multi-user
- Buy domain, map apex/www/admin (and optionally photos/api) subdomains
- Add friend's account and per-photographer public pages

## Open questions

- Domain name to buy and when.
- Whether the public site should show EXIF by default.
- Whether HEIC uploads from iPhone need server-side conversion (adds a dependency) or should be converted before upload.
- Decided 2026-11-27: visual direction is the dark gallery look in the mockup.
