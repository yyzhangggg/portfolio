# Portfolio

A personal portfolio website for artists, musicians, and architects to showcase their work. The public site currently displays sample project text; the Django backend provides a database-backed project API and Django's built-in admin for content management.

## Structure

- `frontend/`: public Vite + React + TypeScript site. Sample content lives in `src/data/sampleProjects.ts`.
- `admin/`: separate Vite + React admin interface placeholder. Custom login and editing are not implemented yet.
- `backend/`: Django REST Framework API, project/image data models, and Django admin.
- `.env`: local Django settings. It is ignored by Git; set production secrets in the hosting provider instead.

Artwork files should eventually live in image/object storage. `ProjectImage` stores their URLs and captions. The backend currently uses SQLite for local development; the app can later be configured for managed PostgreSQL in production.

## Run Locally

Install the frontends' dependencies from the repository root:

```sh
npm --prefix frontend install
npm --prefix admin install
```

Set up and migrate the Django backend:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/python backend/manage.py migrate
backend/.venv/bin/python backend/manage.py createsuperuser
```

Run each app in a separate terminal from the repository root:

```sh
npm --prefix frontend run dev
```

```sh
backend/.venv/bin/python backend/manage.py runserver
```

The public site uses local sample data for now. The API is available at `http://127.0.0.1:8000/api/projects/`; the Django content manager is at `http://127.0.0.1:8000/admin/`.
