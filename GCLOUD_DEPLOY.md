# Deploy JORINOVA NEXUS to Google Cloud (account: dujoely1@gmail.com)

This puts the **whole system** (Postgres + FastAPI + Next.js + local AI) on **one
Google Cloud VM** using the existing `docker-compose.yml`. No Cloud SQL, no
Kubernetes — one machine, reproducible, ~15 minutes.

> An AI agent cannot run this for you — it needs YOUR interactive Google login
> and billing. Run the commands yourself (copy‑paste). Everything is prepared.

---

## 0. One‑time prerequisites (on YOUR computer)
1. Install the **gcloud CLI**: https://cloud.google.com/sdk/docs/install
   (Windows: download the installer; it adds `gcloud` to PATH.)
2. Sign in as your account:
   ```
   gcloud auth login        # opens the browser → sign in as dujoely1@gmail.com
   ```
3. Create a project + enable billing (billing must be ON or VMs won't start):
   ```
   gcloud projects create jorinova-nexus --name="JORINOVA NEXUS"
   gcloud config set project jorinova-nexus
   ```
   Then open https://console.cloud.google.com/billing → link a billing account to
   `jorinova-nexus`. (New accounts get free credit.)
4. Enable the Compute API:
   ```
   gcloud services enable compute.googleapis.com
   ```

## 1. Create the server (one command — uses the helper script)
From the repo root:
```
bash deploy/gcloud_vm.sh
```
This creates an Ubuntu VM (`nexus-pilot`, 2 vCPU / 8 GB, 50 GB disk) with Docker
pre‑installed, and opens the firewall (80, 443, 3000, 8000). It prints the VM's
**external IP** at the end — note it.

(If you prefer to do it by hand, every command the script runs is listed inside it.)

## 2. Put the code on the VM
The repo is **private**: `https://github.com/jorinova/JORINOVA` (branch `main` is
pilot‑ready). Choose one:

**Option A — clone from GitHub (needs a token, because the repo is private).**
On your computer, mint a short‑lived token that can read the repo:
```
gh auth token            # prints a token you already have via gh
```
Then on the VM (paste the token when prompted, or inline it once):
```
gcloud compute ssh nexus-pilot --zone=europe-west1-b
git clone https://<TOKEN>@github.com/jorinova/JORINOVA.git ~/nexus
```
(Later updates: `cd ~/nexus && git pull`.)

**Option B — upload your local copy directly (no token needed).** Simplest:
```
gcloud compute scp --recurse --zone=europe-west1-b "d:/JORINOVA NEXUS" nexus-pilot:~/nexus
```

## 3. Configure secrets, then start the stack
SSH in:
```
gcloud compute ssh nexus-pilot --zone=europe-west1-b
```
On the VM:
```
cd ~/nexus
cp backend/.env.example backend/.env.production
nano backend/.env.production      # fill: SECRET_KEY, DB_PASSWORD, EMAIL_*, SMS, etc.
#   IMPORTANT for production:
#     DEBUG=false
#     DB_ENGINE=postgresql
#     DB_NAME=alis_x   DB_USER=alis_x_user   DB_PASSWORD=<a strong password>
#     DB_HOST=postgres   DB_PORT=5432            (these match the compose service)
#     ALLOWED_HOSTS=<your domain or VM IP>

# Start everything (Postgres + API + web + local AI):
sudo docker compose --profile standard up -d --build

# Create the admin + owner accounts:
sudo docker compose exec api-exposed python scripts/add_user_dujoely.py
```

## 4. Open it
- Web app:  `http://<EXTERNAL_IP>:3000`
- API:      `http://<EXTERNAL_IP>:8000/api/v1/health`
- Login:    `admin / Admin@2026`  or  `dujoely / Jorinova@2026`

## 5. HTTPS (needed for the voice mic + a clean URL)
**Easiest:** keep the `standard` profile and run a Cloudflare tunnel on the VM:
```
sudo docker run -d --network host cloudflare/cloudflared:latest tunnel --url http://localhost:3000
```
→ gives a `https://…trycloudflare.com` URL. Mic works; share it with the labs.

**Proper domain + Let's Encrypt:** point a domain's A‑record at the VM IP, set
`ALLOWED_HOSTS` and the domain in `nginx/conf.d`, then use the **full** profile:
```
sudo docker compose --profile full up -d --build
```
(nginx + certbot issue and renew the certificate automatically.)

## 6. Day‑2
- Logs:    `sudo docker compose logs -f api-exposed`
- Restart: `sudo docker compose --profile standard restart`
- Update:  `git pull && sudo docker compose --profile standard up -d --build`
- Stop:    `sudo docker compose --profile standard down`   (data persists in volumes)
- **Backups:** `postgres_data` and `media_data` are Docker volumes — snapshot the
  VM disk from the Cloud Console (Compute Engine → Disks → Create snapshot) on a schedule.

## Cost note
An `e2-standard-2` runs roughly a few US$/day. Stop the VM when not piloting:
`gcloud compute instances stop nexus-pilot --zone=europe-west1-b` (you keep the disk).
