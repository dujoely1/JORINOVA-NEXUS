#!/usr/bin/env bash
# ============================================================================
# JORINOVA NEXUS — LEAN backend deploy for a SMALL VM (no Docker, no Postgres).
#
# Runs the FastAPI backend with SQLite under a uvicorn systemd service. Light
# enough for a 1–2 GB VM. The web app is hosted separately (Cloudflare Pages /
# Vercel); the mobile app talks to this backend directly over the HTTPS tunnel.
#
# Run on the VM from the repo root:
#     cd ~/JORINOVA && bash deploy/vm_backend_lean.sh
#
# Idempotent: reuses backend/.env (and its secrets) on re-run.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
BACKEND="$REPO/backend"
echo ">>> Repo:    $REPO"
echo ">>> Backend: $BACKEND"

# --- 1. Stop the placeholder Node server (frees resources; not port 8000) ----
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete all >/dev/null 2>&1 || true
  pm2 kill        >/dev/null 2>&1 || true
  echo ">>> Stopped PM2 placeholder."
fi

# --- 2. System packages (Python venv + build basics) ------------------------
if ! command -v python3 >/dev/null 2>&1 || ! python3 -m venv --help >/dev/null 2>&1; then
  echo ">>> Installing Python…"
  sudo apt-get update -y
  sudo apt-get install -y python3 python3-venv python3-pip git curl
fi
PYV="$(python3 -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
echo ">>> Python $PYV"

# --- 3. Virtualenv + dependencies -------------------------------------------
cd "$BACKEND"
if [ ! -d venv ]; then python3 -m venv venv; fi
# shellcheck disable=SC1091
source venv/bin/activate
pip install --upgrade pip wheel >/dev/null
echo ">>> Installing requirements (this is the slow part on a small VM)…"
pip install -r requirements.txt

# --- 4. .env (SQLite) — generate secrets once -------------------------------
ENV="$BACKEND/.env"
gen() { python3 -c "import secrets;print(secrets.token_urlsafe($1))"; }
if [ ! -f "$ENV" ]; then
  echo ">>> Generating backend/.env (SQLite)…"
  ADMIN_PASSWORD="$(gen 12)"; OWNER_PASSWORD="$(gen 12)"
  cat > "$ENV" <<EOF
DEBUG=false
SECRET_KEY=$(gen 48)
ALLOWED_HOSTS=*

# Lean pilot: SQLite (no Postgres). The file lives at backend/alis_x.db
DB_ENGINE=sqlite
DB_NAME=alis_x.db

# Seed accounts (read by scripts/add_user_dujoely.py)
ADMIN_PASSWORD=$ADMIN_PASSWORD
OWNER_PASSWORD=$OWNER_PASSWORD

# Email (optional — fill to enable forgot-password)
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EOF
  chmod 600 "$ENV"
  cat > "$BACKEND/.secrets_pilot.secret" <<EOF
JORINOVA NEXUS pilot logins (KEEP PRIVATE; gitignored)
admin    password: $ADMIN_PASSWORD
dujoely  password: $OWNER_PASSWORD
EOF
  chmod 600 "$BACKEND/.secrets_pilot.secret"
  echo ">>> Wrote $ENV"
else
  echo ">>> Reusing existing $ENV."
fi

# --- 5. Create tables + seed accounts ---------------------------------------
echo ">>> Initialising database + accounts…"
python -c "from core.database import create_all_tables; create_all_tables()"
python scripts/add_user_dujoely.py || echo "    (accounts may already exist — ok)"

# --- 6. systemd service (auto-start, auto-restart) --------------------------
SVC=/etc/systemd/system/jorinova-backend.service
echo ">>> Installing systemd service…"
sudo tee "$SVC" >/dev/null <<EOF
[Unit]
Description=JORINOVA NEXUS backend (FastAPI/uvicorn)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$BACKEND
Environment=PATH=$BACKEND/venv/bin
ExecStart=$BACKEND/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now jorinova-backend
sleep 4

# --- 7. Health check + next steps -------------------------------------------
echo ">>> Health check:"
curl -sf http://localhost:8000/api/v1/health && echo " ✅" || echo " (not yet — check: sudo journalctl -u jorinova-backend -n 50)"

cat <<EOF

============================================================
 ✅ Lean backend is running on :8000 (systemd: jorinova-backend)
   Logins:  cat backend/.secrets_pilot.secret
   Logs:    sudo journalctl -u jorinova-backend -f
   Restart: sudo systemctl restart jorinova-backend

 NEXT — HTTPS tunnel (for the mobile app):
   sudo apt-get install -y cloudflared 2>/dev/null || \\
     (curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cfd && sudo install /tmp/cfd /usr/local/bin/cloudflared)
   cloudflared tunnel --url http://localhost:8000
   → gives https://<random>.trycloudflare.com
   → Mobile API_BASE_URL = https://<random>.trycloudflare.com/api/v1/
============================================================
EOF
