# Deploying (all free tiers)

Order matters: each step produces a URL or key the next one needs.

| Piece | Where | Root directory | Result |
|---|---|---|---|
| Database | Neon | – | `DATABASE_URL` |
| Photo storage | Cloudflare R2 | – | two buckets + API keys |
| API | Render | `backend` | `https://<api>.onrender.com` |
| Public site | Vercel project #1 | `frontend` | `https://<site>.vercel.app` |
| Dashboard | Vercel project #2 | `admin` | `https://<site>-admin.vercel.app` |

Pick the names now (e.g. `yanying-api`, `yanying`, `yanying-admin`) so you can fill them in as you go.

## 1. Neon (database)

1. Create a project (region close to Render's, e.g. US East).
2. Copy the connection string. It must end with `?sslmode=require`.

## 2. Cloudflare R2 (photos and video)

1. R2 → create two buckets: `yanying-originals` (private) and `yanying-public`.
2. On `yanying-public` → Settings → Public access → enable the r2.dev URL (or connect a custom domain later). Copy that URL.
3. R2 → Manage API tokens → create a token with **Object Read & Write** on both buckets. Copy the Access Key ID, Secret Access Key and your Account ID.
4. On **both** buckets → Settings → CORS policy, paste (with your dashboard URL):

   ```json
   [
     {
       "AllowedOrigins": ["https://yanying-admin.vercel.app"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   The browser uploads photos straight to the private bucket and the hero video to the public one, so both need this.

## 3. Render (API)

1. Before deploying, edit **both** `frontend/vercel.json` and `admin/vercel.json`: replace `YOUR-RENDER-SERVICE` with your Render service name (e.g. `yanying-api`). Commit and push.
2. Render → New → Blueprint → pick this repo. It reads `render.yaml`.
3. Fill in the variables it asks for:
   - `DATABASE_URL`: from Neon
   - `DJANGO_ALLOWED_HOSTS`: `yanying-api.onrender.com`
   - `DJANGO_CSRF_TRUSTED_ORIGINS`: `https://yanying.vercel.app,https://yanying-admin.vercel.app`
   - `DJANGO_ADMIN_PATH`: any hard-to-guess path, e.g. `backstage-7f3k/`
   - `DEFAULT_PHOTOGRAPHER_SLUG`: `yanying`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `R2_PRIVATE_BUCKET`: `yanying-originals`; `R2_PUBLIC_BUCKET`: `yanying-public`
   - `R2_PUBLIC_BASE_URL`: the r2.dev URL from step 2.2 (no trailing slash)
4. After the first deploy, open the service → **Shell** and create your account:

   ```sh
   python manage.py create_photographer yanying --display-name "Yanying Zhang" --slug yanying
   ```

5. Check `https://yanying-api.onrender.com/api/health/` returns `{"status": "ok"}`.

## 4. Vercel: public site

1. Vercel → Add New → Project → import this repo.
2. **Project name**: `yanying` (becomes `yanying.vercel.app`).
3. **Root Directory**: `frontend`. Framework preset: Vite (detected). Build and output settings: leave the defaults.
4. Optional environment variable: `VITE_PHOTOGRAPHER_SLUG=yanying`. It is only needed once there are two photographers.
5. Deploy. `/api/*` is forwarded to Render by `frontend/vercel.json`.

## 5. Vercel: dashboard (the admin "subdomain")

1. Add New → Project → import **the same repo** again.
2. **Project name**: `yanying-admin` (becomes `yanying-admin.vercel.app`).
3. **Root Directory**: `admin`.
4. Environment variable: `VITE_PUBLIC_SITE_URL=https://yanying.vercel.app` (for the "View site" link).
5. Deploy, open it, and sign in with the account from step 3.4.

Each Vercel project only rebuilds when files in its own root directory change, so pushing to `frontend/` does not redeploy the dashboard and vice versa.

## 6. Keep the API awake

Render's free instance sleeps after 15 idle minutes and takes about a minute to wake, and requests that arrive while it is waking can fail through the Vercel proxy. Create a free job at cron-job.org that requests `https://yanying-api.onrender.com/api/health/` every 10 minutes.

## Later: your own domain

Buy it (e.g. Cloudflare Registrar), then:

1. Vercel `yanying` project → Settings → Domains → add `example.com` and `www.example.com`.
2. Vercel `yanying-admin` project → Domains → add `admin.example.com`.
3. Add the DNS records Vercel shows you in Cloudflare.
4. Update `DJANGO_CSRF_TRUSTED_ORIGINS` on Render and the R2 CORS `AllowedOrigins` to the new addresses, and `VITE_PUBLIC_SITE_URL` on the dashboard project.

Nothing in the code changes: both sites keep calling `/api` on their own domain.
