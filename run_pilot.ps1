# ============================================================================
# JORINOVA NEXUS — production launcher (Windows / PowerShell)
#
#   Real-software mode: builds the frontend once (production), then runs the
#   optimized server. Starts backend (FastAPI :8000) + frontend (:3000) and
#   prints how to expose ONE public HTTPS link every lab can open on any Wi-Fi.
#   HTTPS is required for the voice mic.
#
#   First run / after code changes:   .\run_pilot.ps1 -Rebuild
#   Normal start (uses existing build): .\run_pilot.ps1
#
#   If scripts are blocked once:
#     powershell -ExecutionPolicy Bypass -File .\run_pilot.ps1 -Rebuild
# ============================================================================

param(
  [switch]$Rebuild,            # force a fresh production build of the frontend
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$backend  = Join-Path $root 'backend'

# Prefer the project venv python if it exists, else system python.
$py = Join-Path $root 'venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

Write-Host "`n=== JORINOVA NEXUS — production launcher ===" -ForegroundColor Cyan

# ── Pre-flight checks ────────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $backend 'main.py')))            { throw "backend\main.py not found — run from the repo root." }
if (-not (Test-Path (Join-Path $frontend 'package.json')))      { throw "frontend\package.json not found." }
if (-not (Test-Path (Join-Path $frontend 'node_modules')))      {
  Write-Host "Installing frontend dependencies (first run)..." -ForegroundColor Yellow
  Push-Location $frontend; cmd /c 'npm install'; if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'npm install failed.' }; Pop-Location
}

# ── 1) Frontend production build (only when needed) ──────────────────────────
$needBuild = $Rebuild -or -not (Test-Path (Join-Path $frontend '.next'))
if ($needBuild) {
  Write-Host "Building frontend (production)..." -ForegroundColor Yellow
  Push-Location $frontend
  cmd /c 'npm run build'
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "Frontend build FAILED (exit $code). Fix the error above before piloting." }
  Write-Host "Frontend build OK." -ForegroundColor Green
} else {
  Write-Host "Using existing frontend build (.next). Pass -Rebuild to rebuild." -ForegroundColor DarkGray
}

# ── 2) Backend (production: no --reload) ─────────────────────────────────────
Write-Host "Starting backend on http://0.0.0.0:$BackendPort ..." -ForegroundColor Green
Start-Process -FilePath $py `
  -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port',"$BackendPort" `
  -WorkingDirectory $backend
Start-Sleep -Seconds 2

# ── 3) Frontend (production server) ──────────────────────────────────────────
Write-Host "Starting frontend (production) on http://localhost:$FrontendPort ..." -ForegroundColor Green
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c',"npm run start -- -p $FrontendPort" `
  -WorkingDirectory $frontend

# ── 4) Access options ────────────────────────────────────────────────────────
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } |
       Select-Object -First 1).IPAddress

Write-Host "`n--------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " LOCAL (this machine):    http://localhost:$FrontendPort"
if ($ip) { Write-Host " SAME Wi-Fi / LAN:        http://$($ip):$FrontendPort   (plain http blocks the voice mic)" }
Write-Host "`n LABS IN DIFFERENT BUILDINGS / Wi-Fi  ->  one public HTTPS link:" -ForegroundColor Yellow
Write-Host "       cloudflared tunnel --url http://localhost:$FrontendPort`n" -ForegroundColor Cyan
Write-Host "   Give that https://...trycloudflare.com URL to every lab."
Write-Host "   Works on any Wi-Fi with internet; the voice mic works (HTTPS)."
Write-Host "--------------------------------------------------------------`n" -ForegroundColor Yellow

# ── 5) Auto-launch the public HTTPS tunnel if cloudflared is installed ────────
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Write-Host "cloudflared detected. Opening the public HTTPS tunnel..." -ForegroundColor Green
  Start-Sleep -Seconds 3
  cloudflared tunnel --url "http://localhost:$FrontendPort"
} else {
  Write-Host "cloudflared NOT found. Install it once:" -ForegroundColor Magenta
  Write-Host "    winget install --id Cloudflare.cloudflared"
  Write-Host "  then re-run, or run the tunnel command above manually.`n"
}
