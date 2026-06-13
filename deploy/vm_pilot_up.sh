#!/usr/bin/env bash
# ============================================================================
# JORINOVA NEXUS — one-shot pilot deploy ON THE VM (Ubuntu).
#
# Brings up the REAL stack (Postgres + FastAPI + Next.js) with docker compose,
# replacing any placeholder Node server. Run it from the repo root on the VM:
#
#     cd ~/JORINOVA && bash deploy/vm_pilot_up.sh
#
# Idempotent: re-running reuses the secrets it generated the first time
# (saved in backend/.env.production and ./.env — both gitignored).
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."                      # repo root
REPO="$(pwd)"
echo ">>> Repo: $REPO"

# --- 1. Free port 3000: stop the placeholder Node server (if any) -----------
if command -v pm2 >/dev/null 2>&1; then
  echo ">>> Stopping PM2 processes (placeholder backend)…"
  pm2 delete all >/dev/null 2>&1 || true
  pm2 kill        >/dev/null 2>&1 || true
fi

# --- 2. Install Docker + compose plugin if missing --------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo ">>> Installing Docker…"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker
fi
DC="sudo docker compose"

# --- 3. Generate secrets ONCE; write the TWO env files consistently ---------
gen() { openssl rand -hex "${1:-24}"; }

ROOT_ENV="$REPO/.env"                         # used by docker compose substitution
APP_ENV="$REPO/backend/.env.production"       # used by the FastAPI app at runtime

if [ ! -f "$APP_ENV" ]; then
  echo ">>> Generating secrets + env files…"
  SECRET_KEY="$(gen 48)"
  DB_PASSWORD="$(gen 24)"
  REDIS_PASSWORD="$(gen 16)"
  ADMIN_PASSWORD="$(gen 12)"
  OWNER_PASSWORD="$(gen 12)"

  # Root .env — Postgres/Redis service config (compose ${VAR} substitution)
  cat > "$ROOT_ENV" <<EOF
DB_NAME=alis_x
DB_USER=alis_x_user
DB_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
# Browser uses relative /api/* (web proxies to the backend) → leave empty.
NEXT_PUBLIC_API_URL=
EOF

  # App env — FastAPI runtime. DB_* MUST match the root .env above.
  cat > "$APP_ENV" <<EOF
DEBUG=false
SECRET_KEY=$SECRET_KEY
ALLOWED_HOSTS=*

DB_ENGINE=postgresql
DB_NAME=alis_x
DB_USER=alis_x_user
DB_PASSWORD=$DB_PASSWORD
DB_HOST=postgres
DB_PORT=5432

# Seed accounts (read by scripts/add_user_dujoely.py on first boot)
ADMIN_PASSWORD=$ADMIN_PASSWORD
OWNER_PASSWORD=$OWNER_PASSWORD

# Email (optional — fill to enable forgot-password emails)
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EOF
  chmod 600 "$ROOT_ENV" "$APP_ENV"

  # Stash the human-facing passwords so the operator can read them once.
  cat > "$REPO/backend/.secrets_pilot.secret" <<EOF
JORINOVA NEXUS pilot credentials (KEEP PRIVATE, gitignored)
admin    password: $ADMIN_PASSWORD
dujoely  password: $OWNER_PASSWORD
EOF
  chmod 600 "$REPO/backend/.secrets_pilot.secret"
  echo ">>> Wrote $ROOT_ENV and $APP_ENV"
else
  echo ">>> Reusing existing $APP_ENV (secrets already set)."
fi

# --- 4. Build + start the core services (no heavy Ollama for the pilot) -----
echo ">>> Building + starting Postgres, Redis, API, Web…"
$DC --profile standard up -d --build postgres redis migrate api-exposed web-exposed

# --- 5. Wait for the API to become healthy ----------------------------------
echo ">>> Waiting for the API to come up…"
for i in $(seq 1 40); do
  if curl -sf http://localhost:8000/api/v1/health >/dev/null 2>&1; then
    echo ">>> API is healthy."
    break
  fi
  sleep 3
done

# --- 6. Seed the admin + owner accounts -------------------------------------
echo ">>> Creating admin + dujoely accounts…"
$DC --profile standard exec -T api-exposed python scripts/add_user_dujoely.py || \
  echo "    (if this errored, the accounts may already exist — that's fine)"

cat <<EOF

============================================================
 ✅ JORINOVA NEXUS pilot stack is up.
   Web (LAN):   http://$(curl -s ifconfig.me 2>/dev/null):3000
   Local test:  curl http://localhost:3000/login   (expect HTTP 200)

 Pilot passwords (read once, then delete the file):
   cat backend/.secrets_pilot.secret

 NEXT — HTTPS (required for the mic + the mobile app):
   sudo docker run -d --network host --name nexus-tunnel \\
     cloudflare/cloudflared:latest tunnel --url http://localhost:3000
   sudo docker logs nexus-tunnel 2>&1 | grep trycloudflare
   → gives a https://<random>.trycloudflare.com URL. That ONE URL serves
     both the web app AND the mobile API (/api/* is proxied by the web).

 Day-2:
   Logs:    $DC logs -f api-exposed
   Update:  git pull && $DC --profile standard up -d --build api-exposed web-exposed
============================================================
EOF
