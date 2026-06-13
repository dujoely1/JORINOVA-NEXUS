# Host the JORINOVA NEXUS web app for free (Vercel) — lean pilot

In the lean setup the VM runs **only the backend** (FastAPI + SQLite). The
Next.js web app is hosted on **Vercel's free tier** (global CDN + automatic
HTTPS). The browser loads the web app from Vercel; Vercel proxies every
`/api/*` request to your VM backend (via the Next.js rewrite), so there are no
CORS issues and you never expose the backend to the browser directly.

```
 Browser ── https ──> Vercel (Next.js web)
                         │  /api/* and /media/* rewritten to:
                         └── https ──> VM backend (Cloudflare tunnel → uvicorn :8000)
 Mobile  ── https ─────────────────────> VM backend directly  (/api/v1/…)
```

## Prerequisites
- The backend is running on the VM and reachable at an HTTPS URL
  (your `https://<random>.trycloudflare.com` from `deploy/vm_backend_lean.sh`).
- A free account at https://vercel.com (sign in with GitHub `jorinova`).

## Steps (Vercel dashboard — ~3 minutes)
1. **Add New… → Project** → import the GitHub repo **`jorinova/JORINOVA`**.
2. **Root Directory:** set to **`frontend`** (the Next.js app lives there).
   Framework preset auto-detects **Next.js**. Leave build/output as default.
3. **Environment Variables** → add:
   | Name | Value |
   |---|---|
   | `BACKEND_INTERNAL_URL` | `https://<your-tunnel>.trycloudflare.com` |

   (No trailing slash. This is the target of the `/api/*` and `/media/*`
   rewrites in `frontend/next.config.ts`. Leave `NEXT_PUBLIC_API_URL` unset so
   the browser uses relative `/api/*`.)
4. **Deploy.** Vercel gives you `https://<project>.vercel.app`.
5. Open it → log in with the pilot `admin` / password. Super-admins are then
   forced through 2FA enrolment (`/security/two-factor`).

## When the tunnel URL changes
`trycloudflare.com` URLs are **ephemeral** (they change every time the tunnel
restarts). For a stable pilot, either:
- keep the `cloudflared` process running (don't restart it), or
- use a **named Cloudflare tunnel** bound to a domain (stable URL), then update
  `BACKEND_INTERNAL_URL` in Vercel once.

After changing `BACKEND_INTERNAL_URL`, redeploy on Vercel (Deployments → ⋯ →
Redeploy) — no code change needed.

## Alternative: Cloudflare Pages
Also free, but Next.js SSR on Pages needs the `@cloudflare/next-on-pages`
adapter and a `wrangler` build step. Vercel is the simpler path for this app;
use Pages only if you prefer staying entirely on Cloudflare.
