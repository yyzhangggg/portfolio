# Ziyue — architecture photography portfolio

An architecture-photography portfolio with a self-service dashboard. See `CLAUDE.md` for the full plan and decisions.

Photos are never cropped on the public site: each project has a grid shape (3:4, 4:3, 16:9 or 9:16) and photos sit whole inside their cells. The photographer can optionally crop a photo's grid thumbnail in the dashboard; the original is kept and the full photo still opens in the lightbox.

## Structure

- `frontend/` — public site (Vite + React + TypeScript): full-screen hero video, series gallery, about section, series pages with a lightbox.
- `admin/` — photographer dashboard (Vite + React): sign in, upload photos, edit alt text/captions, publish, organize series, set the hero video, poster and About section.
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
   backend/.venv/bin/python backend/manage.py create_photographer ziyue --display-name "Ziyue" --slug ziyue --staff
   backend/.venv/bin/python backend/manage.py runserver
   ```

3. Public site, in a second terminal:

   ```sh
   npm --prefix frontend install
   npm --prefix frontend run dev
   ```

   Open http://localhost:5173. Requests to `/api` and `/media` are proxied to Django. If Django is not running, the dev server shows sample placeholder content.

4. Dashboard, in a third terminal:

   ```sh
   npm --prefix admin install
   npm --prefix admin run dev
   ```

   Open http://localhost:5174 and sign in with the account from step 2.

Django's own admin (for maintenance) is at `http://127.0.0.1:8000/backstage-maintenance/` (path set by `DJANGO_ADMIN_PATH`).

## Tests

```sh
cd backend
.venv/bin/python manage.py test gallery              # API tests
.venv/bin/python -m pytest gallery/tests/test_processing.py   # image processing
```

## Deploy

Step-by-step guide for Neon, Cloudflare R2, Render and the two Vercel projects: [`docs/deploy.md`](docs/deploy.md).
