# Run JORINOVA NEXUS on any machine (presentation / demo)

The whole system — Postgres + FastAPI + Next.js web + Redis + **offline Ollama AI**
— comes up with one command. Works fully offline; uses Claude when online.

## 1. Prerequisites (once, on the demo machine)
- **Docker Desktop** (Windows/macOS) or Docker Engine + Compose (Linux).
- ~8 GB RAM recommended (Ollama). Without enough RAM, skip AI: use `--profile offline`.

## 2. Bring the project
Copy the **whole project folder** to the machine (USB / scp) — **including
`backend/.env.production`**. That file is git-ignored (holds the Claude key +
DB password), so a fresh `git clone` will NOT have it — carry it with the folder,
or copy `backend/.env.production.example` → `backend/.env.production` and fill it in.

## 3. Start
```bash
# Recommended: DB + API + Web + Redis + offline Ollama AI
docker compose --profile standard up -d --build

# No AI (lowest RAM, e.g. weak laptop): DB + API + Web only
docker compose --profile offline up -d --build
```
First run builds images + pulls the Ollama models (phi3:mini + nous-hermes) — a
few minutes. Then:
- **Web app:** http://localhost:3000
- **API:**     http://localhost:8000/api/v1/health
- Login: `admin` / `Admin@2026`

## 4. AI behaviour (automatic)
- **No internet** → local Ollama answers (offline generative AI).
- **Internet + Claude key** → Claude answers.
- Force it: `POST /api/v1/ai/ai-mode {"mode":"offline"|"cloud"|"auto"}` (admin),
  or set `AI_MODE=` in `backend/.env.production`.

## 5. Stop / reset
```bash
docker compose --profile standard down          # stop
docker compose --profile standard down -v       # stop + wipe data volumes
```

## Notes
- `standard` exposes API on `:8000` and Web on `:3000` directly (no nginx).
- `full` profile adds nginx + HTTPS + Celery + Flower (production, not needed for a demo).
- The Claude key lives ONLY in `backend/.env.production` (git-ignored) — never commit it.
