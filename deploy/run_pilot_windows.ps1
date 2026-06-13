<#
  JORINOVA NEXUS - single-script pilot launcher for Windows (PowerShell 5.1).

  Runs the REAL backend (FastAPI + SQLite) on http://localhost:8000, bootstraps
  the database, and opens a Cloudflare HTTPS tunnel so the mobile app can reach
  it. Prints the trycloudflare URL + the mobile API_BASE_URL at the end.

  USAGE (from anywhere):
      powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\run_pilot_windows.ps1"

  Optional: add  -WithFrontend  to also start the Next.js web app on :3000.
  Stop everything later with:  Get-Process python,cloudflared,node -ErrorAction SilentlyContinue | Stop-Process
#>
param(
    [switch]$WithFrontend
)

$ErrorActionPreference = 'Stop'
$Root    = 'D:\JORINOVA NEXUS'
$Backend = Join-Path $Root 'backend'
$Frontend= Join-Path $Root 'frontend'
$DeployDir = Join-Path $Root 'deploy'

function Info($m){ Write-Host ">>> $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "!!  $m" -ForegroundColor Yellow }

function New-Secret([int]$len = 24){
    $chars = (48..57) + (65..90) + (97..122)
    -join (1..$len | ForEach-Object { [char]($chars | Get-Random) })
}

# ── 0. prerequisites ────────────────────────────────────────────────────────
Info 'Checking Python...'
$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) { throw 'Python not found in PATH. Install Python 3.10+ first.' }
Ok ("Python: " + ((& python --version) 2>$null))

# ── 1. backend/.env (SQLite, generate secrets once) ─────────────────────────
$envPath = Join-Path $Backend '.env'
if (-not (Test-Path $envPath)) {
    Info 'Creating backend\.env (SQLite, generated secrets)...'
    $adminPw = New-Secret 12
    $ownerPw = New-Secret 12
    $secret  = New-Secret 48
    $envText = @"
DEBUG=false
SECRET_KEY=$secret
ALLOWED_HOSTS=*

DB_ENGINE=sqlite
DB_NAME=alis_x.db

ADMIN_PASSWORD=$adminPw
OWNER_PASSWORD=$ownerPw

EMAIL_HOST=
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
"@
    # write WITHOUT a BOM so python-dotenv reads the first key correctly
    [System.IO.File]::WriteAllText($envPath, $envText, (New-Object System.Text.UTF8Encoding($false)))
    $secretsPath = Join-Path $Backend '.secrets_pilot.secret'
    [System.IO.File]::WriteAllText($secretsPath,
        "JORINOVA NEXUS pilot logins (KEEP PRIVATE)`r`nadmin    password: $adminPw`r`ndujoely  password: $ownerPw`r`n",
        (New-Object System.Text.UTF8Encoding($false)))
    Ok 'Wrote backend\.env  (passwords in backend\.secrets_pilot.secret)'
} else {
    Ok 'backend\.env already exists - reusing it.'
}

# ── 2. dependencies (idempotent) ────────────────────────────────────────────
Info 'Installing backend dependencies (idempotent; may take a few minutes the first time)...'
Push-Location $Backend
& python -m pip install --disable-pip-version-check -q -r requirements.txt
if (-not $?) { Warn 'pip install -r requirements.txt reported issues; continuing.' }
if (Test-Path (Join-Path $Backend 'requirements-prod.txt')) {
    & python -m pip install --disable-pip-version-check -q -r requirements-prod.txt
    if (-not $?) { Warn 'pip install -r requirements-prod.txt reported issues; continuing.' }
}
Pop-Location
Ok 'Dependencies ready.'

# ── 3. database bootstrap ───────────────────────────────────────────────────
Info 'Bootstrapping database (create tables + admin)...'
Push-Location $Backend
& python scripts\migrate.py
Pop-Location
Ok 'Database ready.'

# ── 4. start backend on :8000 (skip if already up) ──────────────────────────
function Test-Backend {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8000/api/v1/health' -TimeoutSec 3
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

if (Test-Backend) {
    Ok 'Backend already running on :8000.'
} else {
    Info 'Starting backend (uvicorn) on :8000...'
    Start-Process -FilePath 'python' `
        -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port','8000' `
        -WorkingDirectory $Backend -WindowStyle Minimized
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Backend) { $up = $true; break }
        Write-Host ("    waiting for backend... ({0})" -f ($i + 1))
    }
    if ($up) { Ok 'Backend is UP (http://localhost:8000).' }
    else { throw 'Backend did not become healthy. Check the minimized python window for errors.' }
}

# ── 5. optional frontend on :3000 ───────────────────────────────────────────
if ($WithFrontend) {
    Info 'Starting frontend (Next.js) on :3000...'
    Push-Location $Frontend
    if (-not (Test-Path (Join-Path $Frontend '.next'))) {
        & npm install
        & npm run build
    }
    Pop-Location
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run start' -WorkingDirectory $Frontend -WindowStyle Minimized
    Ok 'Frontend starting on http://localhost:3000'
}

# ── 6. cloudflared tunnel (download if missing) ─────────────────────────────
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue)
if ($cf) { $cfPath = $cf.Source }
else {
    $cfPath = Join-Path $DeployDir 'cloudflared.exe'
    if (-not (Test-Path $cfPath)) {
        Info 'Downloading cloudflared.exe...'
        $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $cfPath
    }
    Ok 'cloudflared ready.'
}

Info 'Opening HTTPS tunnel to http://localhost:8000 ...'
$cfOut = Join-Path $DeployDir '_cloudflared.out.log'
$cfErr = Join-Path $DeployDir '_cloudflared.err.log'
if (Test-Path $cfOut) { Remove-Item $cfOut -Force }
if (Test-Path $cfErr) { Remove-Item $cfErr -Force }
Start-Process -FilePath $cfPath `
    -ArgumentList 'tunnel','--url','http://localhost:8000' `
    -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr -WindowStyle Hidden

$tunnel = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $txt = ''
    if (Test-Path $cfOut) { $txt += (Get-Content $cfOut -Raw -ErrorAction SilentlyContinue) }
    if (Test-Path $cfErr) { $txt += (Get-Content $cfErr -Raw -ErrorAction SilentlyContinue) }
    $m = [regex]::Match($txt, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $tunnel = $m.Value; break }
    Write-Host ("    waiting for tunnel URL... ({0})" -f ($i + 1))
}

# ── 7. summary ──────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
if ($tunnel) {
    Write-Host (" PUBLIC HTTPS URL : {0}" -f $tunnel) -ForegroundColor Green
    Write-Host (" MOBILE API_BASE_URL : {0}/api/v1/" -f $tunnel) -ForegroundColor Green
    Write-Host (" Web (if -WithFrontend): {0}" -f $tunnel) -ForegroundColor Green
} else {
    Warn 'Tunnel URL not detected yet. Check deploy\_cloudflared.err.log in a few seconds.'
}
Write-Host ' Local backend   : http://localhost:8000/api/v1/health'
Write-Host ' Pilot logins    : type  backend\.secrets_pilot.secret'
Write-Host ''
Write-Host ' STOP everything later:' -ForegroundColor Yellow
Write-Host '   Get-Process python,cloudflared,node -ErrorAction SilentlyContinue | Stop-Process'
Write-Host '============================================================' -ForegroundColor Green
