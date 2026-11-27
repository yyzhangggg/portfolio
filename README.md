# Portfolio — photography site

A personal photography website with a self-service dashboard. See `CLAUDE.md` for the full plan and decisions.

## Structure

- `frontend/` — public site (Vite + React + TypeScript): full-screen hero video, series gallery, about section, series pages with a lightbox.
- `admin/` — photographer dashboard (Vite + React). Not built yet; the backend API for it is ready.
- `backend/` — Django + Django REST Framework API (`gallery` app): photos, series, homepage settings, uploads, session login.
- `render.yaml` — Render blueprint for the API. `frontend/vercel.json` — Vercel rewrites.

Uploads go straight from the browser to storage (Cloudflare R2 in production, `backend/media/` locally). Only JPEG photos are accepted. The original is kept in a private bucket; the site shows WebP copies in three sizes that carry no EXIF or GPS data.

## Run locally

1. Settings: copy `.env.example` to `.env` and set `DJANGO_SECRET_KEY`.
2. Backend:

   ```sh
   python3 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   backend/.venv/bin/python backend/manage.py migrate
   backend/.venv/bin/python backend/manage.py create_photographer yanying --display-name "Yanying Zhang" --slug yanying --staff
   backend/.venv/bin/python backend/manage.py runserver
   ```

3. Public site, in a second terminal:

   ```sh
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

   Open http://localhost:5173. Requests to `/api` and `/media` are proxied to Django. If Django is not running, the dev server shows sample placeholder content.

Until the dashboard exists, content can be managed through Django's maintenance admin at `http://127.0.0.1:8000/backstage-maintenance/` (path set by `DJANGO_ADMIN_PATH`).

## Tests

```sh
cd backend
.venv/bin/python manage.py test gallery              # API tests
.venv/bin/python -m pytest gallery/tests/test_processing.py   # image processing
```

## Deploy (all free tiers)

1. **Neon**: create a project and copy its connection string (with `?sslmode=require`).
2. **Cloudflare R2**: create two buckets — one private (originals), one public (variants and video; enable its r2.dev URL or attach a custom domain). Create an API token with read/write on both. On **both** buckets, add a CORS rule allowing `PUT` from your admin site's origin with the `Content-Type` header: photos are uploaded straight to the private bucket and the hero video straight to the public one.
3. **Render**: New → Blueprint → this repo. Fill in the `sync: false` variables (`DATABASE_URL`, R2 values, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_ADMIN_PATH`, `DEFAULT_PHOTOGRAPHER_SLUG`). Then in the Render shell run `python manage.py create_photographer ...` once.
4. **Vercel**: import the repo with root directory `frontend`. In `frontend/vercel.json`, replace `YOUR-RENDER-SERVICE` with your Render service name.
5. **Keep-alive**: point a free pinger (e.g. cron-job.org) at `https://<render-service>.onrender.com/api/health/` every 10 minutes.
