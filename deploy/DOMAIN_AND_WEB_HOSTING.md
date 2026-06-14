# Permanent domain (api.jorinova.com) + free web hosting (Vercel)

The codebase is already **environment-driven** (no hardcoded URLs): the mobile
app reads `API_BASE_URL` at build time and the web reads `BACKEND_INTERNAL_URL`
at runtime. So moving from the throwaway Cloudflare tunnel to a permanent domain
is configuration only — no code changes.

---

## B. Permanent API domain — `api.jorinova.com` (named Cloudflare tunnel)

You need a domain you own, added to **Cloudflare** (DNS managed there). Then:

1. **Log in once** (opens a browser; pick your domain):
   ```powershell
   D:\JORINOVA NEXUS\deploy\cloudflared.exe tunnel login
   ```
2. **Create + route + run the named tunnel** (keep the backend running on :8000):
   ```powershell
   powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\cloudflared_named_tunnel.ps1" -Hostname api.jorinova.com
   ```
   Add `-InstallService` to run it automatically on every boot.
3. Verify: open `https://api.jorinova.com/api/v1/health` → `{"status":"ok"}`.

Now rebuild the mobile APK against the stable host (no more trycloudflare):
```
GitHub → jorinova/jorinova-mobile → Actions → Build Android APK → Run workflow
  api_base_url = https://api.jorinova.com/api/v1/
```
This URL never changes on restart, so you don't rebuild the APK again.

> No domain yet? You can register one (e.g. jorinova.com) at any registrar and
> change its nameservers to Cloudflare's (free plan). Until then, the throwaway
> `*.trycloudflare.com` from `run_pilot_windows.ps1` still works for testing.

---

## C. Web app on Vercel (free, global HTTPS + CDN)

The Next.js web app proxies `/api/*` to the backend, so it just needs to know
the backend URL.

1. Push is already done (repo `jorinova/JORINOVA`).
2. On **vercel.com** → **Add New Project** → import `jorinova/JORINOVA`.
3. **Root Directory** → set to `frontend`.
4. **Environment Variables** (Project → Settings):
   - `BACKEND_INTERNAL_URL = https://api.jorinova.com`
   - `NEXT_PUBLIC_API_URL =` *(leave empty — browser uses relative `/api/*`)*
5. **Deploy.** You get `https://<project>.vercel.app` (add your own domain like
   `app.jorinova.com` later in Vercel → Domains).

How it works: browser → Vercel (web) → `next.config.ts` rewrite sends `/api/*`
to `BACKEND_INTERNAL_URL` (your Cloudflare‑tunnelled backend). One web URL serves
the UI; the API stays on `api.jorinova.com`.

> Alternative (Cloudflare Pages): same idea — set the build's root to `frontend`,
> framework Next.js, and the same two environment variables.

---

## Switching dev / staging / prod (no hardcoding)

| Target | Mobile `--dart-define=API_BASE_URL` | Web `BACKEND_INTERNAL_URL` |
|---|---|---|
| Local | `http://10.0.2.2:8000/api/v1/` (emulator) | `http://localhost:8000` |
| Pilot (tunnel) | `https://<random>.trycloudflare.com/api/v1/` | same |
| Production | `https://api.jorinova.com/api/v1/` | `https://api.jorinova.com` |

Also set the backend `ALLOWED_HOSTS` in `backend/.env` to your domain(s) for prod
(e.g. `ALLOWED_HOSTS=api.jorinova.com,app.jorinova.com`).
