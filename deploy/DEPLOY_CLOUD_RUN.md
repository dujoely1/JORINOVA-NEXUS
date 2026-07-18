# Deploy JORINOVA NEXUS on Google Cloud Run (free tier)

Cloud Run runs your Docker container, **scales to zero** when idle (so it costs
nothing at rest), and handles a cold start by *holding* the request until the app
is up — so you get the Render "502 while waking up" problem **far less often**.

**Free allowance (per month, account-wide):** ~2,000,000 requests · 360,000 GiB‑seconds
memory · 180,000 vCPU‑seconds. A demo/pilot stays inside this for free.

> ⚠️ Cloud Run still requires a **billing account** linked to the project (add a
> card). You are **not charged** at demo volume, and new accounts get **$300 free
> credit** for 90 days on top of the always‑free tier.

Keep your **Neon Postgres** database exactly as it is — Cloud Run is stateless and
connects to Neon over the internet (just set `DATABASE_URL`).

---

## What we already fixed for Cloud Run
`backend/Dockerfile` now binds to **`${PORT:-8000}`** (Cloud Run injects `PORT=8080`;
locally it stays 8000) and logs to stdout. Without this, the deploy fails with
*"container failed to start and listen on PORT=8080"*.

---

## Option A — CLI (most reliable for this monorepo) ✅ recommended

The API Dockerfile lives in `backend/`, so we deploy **with `backend/` as the build
context** (this avoids the "COPY requirements.txt not found" error you'd hit if the
build context were the repo root).

```bash
# 1. Install the gcloud CLI, then:
gcloud auth login
gcloud config set project jorinova-nexus         # your project id

# 2. Enable the services (one time)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# 3. Deploy the BACKEND (builds backend/Dockerfile, context = backend/)
gcloud run deploy nexus-api \
  --source backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi --cpu 1 \
  --timeout 300 \
  --set-env-vars "WEB_CONCURRENCY=1,FORCE_2FA=false,DB_ENGINE=postgresql,DATABASE_URL=YOUR_NEON_URL,SECRET_KEY=YOUR_LONG_RANDOM,ANTHROPIC_API_KEY=YOUR_KEY"
```

`gcloud` prints a URL like `https://nexus-api-xxxxx.europe-west1.run.app` — that is
your API. Test it: open `.../api/v1/health` → should return `{"status":"ok",...}`.

---

## Option B — Console "Deploy from a repository" (the *Configure* screen)

console.cloud.google.com → **Cloud Run** → **Create service**.

1. Select **“Continuously deploy from a repository (source or function)”** →
   **Set up with Cloud Build**.
2. **Repository provider: GitHub** → Authenticate → pick **`dujoely1/JORINOVA-NEXUS`**.
3. This opens the **Configure (Build Configuration)** panel — set it **exactly**:

   | Field | What to choose |
   |---|---|
   | **Branch** | `^main$` |
   | **Build Type** | **Dockerfile** (not Buildpacks) |
   | **Source location / Dockerfile** | `/backend/Dockerfile` |

   > If the console builds with the **repo root** as context, the backend Dockerfile's
   > `COPY` paths break. If you can't set the build context to `backend/` here, use
   > **Option A (CLI)** instead — it sets the context correctly.

4. Back on the service page:
   - **Service name** → type **`nexus-api`**
     *(lowercase letters/numbers/hyphens, must start with a letter — this is the
     "configure name" you asked about).*
   - **Region** → **`europe-west1`** (or `africa-south1` for lower latency to Rwanda).
   - **Authentication** → **Allow unauthenticated invocations** ✅ (it's a public web API).
   - **CPU / Memory** → **1 CPU**, **2 GiB** (torch + the vision models need it).
   - **Request timeout** → **300** seconds.

5. **Container → Variables & Secrets** → add:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string (same as on Render) |
   | `SECRET_KEY` | a long random string |
   | `FORCE_2FA` | `false` |
   | `WEB_CONCURRENCY` | `1` |
   | `ANTHROPIC_API_KEY` | your Claude key (optional — leave blank to stay offline) |
   | `APP_BASE_URL` | your frontend URL (fill after step 6) |

6. **Create** → wait for the build → you get the `https://nexus-api-….run.app` URL.

---

## The frontend (Next.js)

Two easy choices:

- **Vercel (simplest for Next.js, free):** import the repo, set root directory to
  `frontend`, and set env `BACKEND_INTERNAL_URL = https://nexus-api-….run.app`
  (the app proxies `/api/*` there — see `frontend/next.config`).
- **Second Cloud Run service:** `gcloud run deploy nexus-web --source frontend --region europe-west1 --allow-unauthenticated --set-env-vars "BACKEND_INTERNAL_URL=https://nexus-api-….run.app"`.

Then set the backend's `APP_BASE_URL` / `PUBLIC_APP_URL` to the frontend URL so
password-reset links and QR/phone login point to the right place.

---

## After deploy — make login work
Cloud Run can't run `fix_login.ps1` (that's for your local DB). For the Neon DB the
admin already exists; just make sure **`FORCE_2FA=false`** is set (above) so the
super_admin isn't forced through 2FA setup. Log in with **admin / Admin@2026**.

## Cold starts
With **min instances = 0** (default, fully free) the first request after idle waits
~10–30 s while the container starts — but Cloud Run serves it instead of 502‑ing.
For zero cold starts set **min instances = 1** (leaves one instance always warm —
uses the free allowance faster and may cost a little).
