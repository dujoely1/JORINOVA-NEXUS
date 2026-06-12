# Running NEXUS across labs in different buildings / different Wi-Fi

Your situation: Biochem, Hematology, Histo, Serology... are in **separate buildings
with separate Wi-Fi**. They may or may not be on the same institutional network
("root"). Here is how to make them all use ONE NEXUS system.

## The key fact

NEXUS already runs behind **one origin**:
- `frontend/.env.local` → `NEXT_PUBLIC_API_URL=` (empty) → the app uses **relative URLs**.
- `frontend/next.config.ts` → **proxies `/api/*` and `/media/*`** to the backend.

So you only need to expose **one address (port 3000)** and everything works through it.

⚠️ **The voice mic (speech recognition) only works on HTTPS or localhost.** Over a
plain `http://<LAN-IP>:3000` link the microphone is **blocked by the browser**.
This is the single most important reason to use the tunnel option below.

---

## First: are the buildings on the same network?

Quick test — from a PC in **Hematology**, open in a browser:
`http://<server-LAN-IP>:3000` (the launcher prints the server's IP).
- **It loads** → all buildings are on one LAN ("same root"). You can use Option A.
- **It does NOT load** → the Wi-Fis are isolated. You must use **Option B** (internet/tunnel).

(Same Wi-Fi *name* does NOT guarantee the same network — only the test above does.)

---

## Option A — Same LAN (all buildings on one institutional network)

1. Pick one server PC. Run:  `powershell -ExecutionPolicy Bypass -File .\run_pilot.ps1`
2. Each lab opens `http://<server-LAN-IP>:3000`.
3. **Voice mic:** plain http blocks the mic. Two fixes:
   - Best: use the tunnel (Option B) even on a LAN — gives HTTPS.
   - Quick per-PC workaround: in Chrome open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
     add `http://<server-LAN-IP>:3000`, set **Enabled**, relaunch Chrome.

## Option B — Different Wi-Fi / different buildings (RECOMMENDED) 🟢

Works no matter how the buildings are wired, as long as each has **internet**.
One public **HTTPS** link → every lab opens the same URL → voice works.

1. On the server PC run:  `powershell -ExecutionPolicy Bypass -File .\run_pilot.ps1`
2. Install the tunnel once (one time):  `winget install --id Cloudflare.cloudflared`
3. In a new window:  `cloudflared tunnel --url http://localhost:3000`
   → it prints `https://something.trycloudflare.com`
4. **Give that HTTPS URL to every lab** (Biochem, Hematology, Histo, Serology...).
   They open it in Chrome/Edge on their own Wi-Fi. Done. Mic + everything works.

> `ngrok http 3000` works the same way if you prefer ngrok (needs a free account).

---

## Login + data for the demo
- Admin: username **`admin`** — password = `ADMIN_PASSWORD` from `.env`
  (or the random one printed once in the server log on first run).
- Data already seeded. To re-seed a fresh DB: boot once, then
  `python scripts/seed_production_clinical.py` and `python scripts/seed_dept_demo.py`.

## Notes
- Use **Chrome or Edge** (best speech support). Each lab grants mic permission once.
- For a permanent install (not a quick pilot): host the backend on a small cloud VM
  with Postgres (`db_engine=postgresql` in `backend/.env`) and a real domain + HTTPS,
  then every site just opens that domain. The tunnel above is the fast pilot version
  of the same idea.
- "Per-building offline instances that sync later" is possible (the `/api/v1/sync/*`
  layer exists) but is **post-pilot** — don't attempt it for tomorrow.

---

## Email for "forgot password" (code goes to the user's email, never shown in the app)

The 6-digit reset code is **no longer displayed in JORINOVA** — it is emailed to the
user, and the email also has a **"Yes, it's me"** link they can tap on their own
device. To make email actually send, set these in `backend/.env`:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=youraddress@gmail.com
EMAIL_HOST_PASSWORD=your-16-char-gmail-app-password   # NOT your normal password
APP_BASE_URL=https://your-pilot-url                    # the tunnel/domain — makes the "Yes, it's me" link work
```

- Gmail: turn on 2-Step Verification, then create an **App Password** and use that.
- If SMTP is **not** configured, the code is written to the **server log only**
  (so an operator can still retrieve it during setup) — it is never sent to the browser.
- `APP_BASE_URL` must be the public URL labs use (e.g. the Cloudflare tunnel), so the
  "Yes, it's me" link opens the app on the user's phone at the new-password step.

## Stay-signed-in (no re-login mid-demo)
- The session now lasts **7 days** and the **5-minute idle auto-logout is off** by default
  (12-hour window). To re-enable a short idle timeout set `NEXT_PUBLIC_IDLE_MINUTES`
  (minutes) in `frontend/.env.local`; `0` disables it entirely.

## Post-quantum security
- All record tags (audit, results, amendments) and the reset code now go through
  one signing layer (`backend/core/pqc.py`). Check it live: `GET /api/v1/admin/pqc`
  (admin only) → shows backend + public-key fingerprint.
- `real_pqc:false` = the SHA3-256 integrity fallback (default, always works offline).
  To activate **true CRYSTALS-Dilithium** signatures, install `pqcrypto` on a machine
  with a C toolchain (`pip install pqcrypto`); the layer switches automatically and a
  real Dilithium key-pair is generated at startup. No code change needed.

## Offline & satellite
- "Satellite internet" is just internet to the app — the tunnel/server URL works over it.
- The system is **offline-first** at the data layer (`/api/v1/sync/*`: batch, delta,
  conflict resolution) so a site with intermittent links can queue and sync.
- **Full browser-offline** (open the app with no connection at all) needs a PWA service
  worker, which is **not enabled yet** — treat continuous connectivity (even slow/satellite)
  as required for the pilot.
