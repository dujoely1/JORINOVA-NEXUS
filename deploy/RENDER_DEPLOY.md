# Deploy the FULL JORINOVA NEXUS to Render (free, always-on)

This gives you a permanent public link that stays up when your PC is off. The
backend auto-starts and auto-restarts in the cloud — you never launch it by hand.

Everything is pre-configured in **`render.yaml`** (repo root). You only need a
free Render account and ~5 minutes.

```
 Browser ── https ──> jorinova-nexus-web   (Next.js, always-on URL)
                         │  /api/* proxied (same-origin, no CORS)
                         └── https ──> jorinova-nexus-api  (FastAPI, Docker)
                                          └── jorinova-nexus-db (PostgreSQL)
```

## Prerequisites
- This branch pushed to GitHub: `https://github.com/jorinova/JORINOVA.git`
  (the `render.yaml` and all app code must be on the branch you deploy).
- A free account at https://render.com (sign in with the **GitHub `jorinova`** account).

## Steps (~5 min)
1. **render.com → New → Blueprint.**
2. Connect GitHub and pick the **`jorinova/JORINOVA`** repo, then choose the
   branch that has `render.yaml`.
3. Render reads `render.yaml` and shows 3 resources to create
   (db + api + web). Click **Apply**.
4. When prompted for **environment variables marked "set by you"**, set:
   - **`ADMIN_PASSWORD`** — the password for the super-admin login (`admin`).
     Pick a strong one and keep it. (Leave the SMS/email keys blank for now.)
5. Wait until **all three resources are green** (first build ~5–10 min — the
   Docker backend image takes the longest).
6. Open the **`jorinova-nexus-web`** URL → that is your permanent link:
   **`https://jorinova-nexus-web.onrender.com`**
   - Log in as `admin` / the `ADMIN_PASSWORD` you set.
   - Or view the installer at `…/install?preview=1`.

## If the API URL got a suffix
The web app is built to call `https://jorinova-nexus-api.onrender.com`. If
Render appended a random suffix (because the name was taken), the web app can't
reach the backend. Fix once:
1. Open the **jorinova-nexus-api** service → copy its real URL.
2. Open **jorinova-nexus-web → Environment** → set `BACKEND_INTERNAL_URL` to that
   URL → **Save** → it redeploys. Also update `ALLOWED_HOSTS` / `PUBLIC_APP_URL`
   on the **api** service to the real web URL.

## Free-tier notes (important)
- **Sleep on idle:** free services spin down after ~15 min of no traffic and
  take ~30–60 s to wake on the next visit. The URL always works — first hit is
  just slow. (Paid "Starter" plan = always warm.)
- **Database expiry:** Render's free PostgreSQL is removed ~30 days after
  creation. For permanent use, upgrade the DB to a paid plan, or move to the
  Google Cloud VM (`deploy/gcloud_vm.sh`) when you're ready to pay — your data
  model is identical (Postgres), so it's a clean migration.
- **Enable SMS/email later:** add `SMS_PROVIDER`+`PINDO_API_TOKEN` (or
  `AT_USERNAME`/`AT_API_KEY`) and `EMAIL_HOST*` on the **api** service. Until
  then, staff-credential SMS and the install-summary email are queued, not sent.

## Optional: deploy with the Render CLI instead of the dashboard
If you prefer the terminal and have a Render API key:
```bash
# one-time
npm i -g render            # or: brew install render
render login               # opens browser to authorise YOUR account
# from the repo root, with render.yaml committed:
render blueprint launch
```
This is the same Blueprint flow, just from the CLI.
