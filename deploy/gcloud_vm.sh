#!/usr/bin/env bash
# ============================================================================
# JORINOVA NEXUS — create a Google Cloud VM ready to run the docker-compose stack.
#
# Prereqs (do these first — see GCLOUD_DEPLOY.md):
#   gcloud auth login              # sign in as dujoely1@gmail.com
#   gcloud config set project jorinova-nexus
#   gcloud services enable compute.googleapis.com
#   (billing must be enabled on the project)
#
# Run from the repo root:   bash deploy/gcloud_vm.sh
# Override defaults with env vars, e.g.:  ZONE=us-central1-a bash deploy/gcloud_vm.sh
# ============================================================================
set -euo pipefail

VM_NAME="${VM_NAME:-nexus-pilot}"
ZONE="${ZONE:-europe-west1-b}"
MACHINE="${MACHINE:-e2-standard-2}"      # 2 vCPU / 8 GB — fine for a pilot
DISK_GB="${DISK_GB:-50}"
IMAGE_FAMILY="${IMAGE_FAMILY:-ubuntu-2204-lts}"
IMAGE_PROJECT="${IMAGE_PROJECT:-ubuntu-os-cloud}"
TAG="nexus"

echo ">>> Project: $(gcloud config get-value project 2>/dev/null)"
echo ">>> Creating VM '${VM_NAME}' in ${ZONE} (${MACHINE}, ${DISK_GB}GB)…"

# Startup script: install Docker + compose plugin on first boot.
STARTUP='#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker $(ls /home | head -1) || true
echo "DOCKER_READY" > /var/log/nexus-startup.done
'

gcloud compute instances create "${VM_NAME}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE}" \
  --image-family="${IMAGE_FAMILY}" \
  --image-project="${IMAGE_PROJECT}" \
  --boot-disk-size="${DISK_GB}GB" \
  --boot-disk-type=pd-balanced \
  --tags="${TAG}" \
  --metadata=startup-script="${STARTUP}"

echo ">>> Opening firewall (HTTP/HTTPS + pilot ports 3000/8000)…"
gcloud compute firewall-rules create nexus-web \
  --allow=tcp:80,tcp:443,tcp:3000,tcp:8000 \
  --target-tags="${TAG}" \
  --description="JORINOVA NEXUS web/api" \
  2>/dev/null || echo "    (firewall rule already exists — ok)"

IP=$(gcloud compute instances describe "${VM_NAME}" --zone="${ZONE}" \
      --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

cat <<EOF

============================================================
 VM ready:  ${VM_NAME}   (zone ${ZONE})
 EXTERNAL IP: ${IP}
============================================================
 Next (see GCLOUD_DEPLOY.md, steps 2-3):
   1. Wait ~90s for Docker to finish installing on the VM.
   2. Upload the code:
        gcloud compute scp --recurse --zone=${ZONE} . ${VM_NAME}:~/nexus
   3. SSH in and start it:
        gcloud compute ssh ${VM_NAME} --zone=${ZONE}
        cd ~/nexus && cp backend/.env.example backend/.env.production
        nano backend/.env.production            # set secrets (DEBUG=false, DB_*, etc.)
        sudo docker compose --profile standard up -d --build
        sudo docker compose exec api-exposed python scripts/add_user_dujoely.py
   4. Open  http://${IP}:3000   (login admin / Admin@2026)
============================================================
EOF
