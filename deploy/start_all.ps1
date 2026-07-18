<#
  JORINOVA NEXUS — one-command launcher (fixes the "login / voice / phone = 502").
  ============================================================================
  The 502 happens when the FastAPI backend on :8000 is NOT running: the Next.js
  dev server proxies every /api/* call to http://localhost:8000, and if nothing
  answers there the proxy returns 502 Bad Gateway. This script:
    1. resets login safety (runs fix_login.ps1 once — FORCE_2FA off, admin OK),
    2. starts the BACKEND in its own window WITH AUTO-RESTART (so a crash can no
       longer leave you on a dead :8000 → no more 502),
    3. waits until /api/v1/health answers,
    4. starts the FRONTEND (Next.js) in its own window.

  Run:
    powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\start_all.ps1"
  Skip the login reset:  ... start_all.ps1 -NoFix
  Also open an ngrok tunnel for phone access:  ... start_all.ps1 -Tunnel
#>
param(
  [switch]$NoFix,
  [switch]$Tunnel,
  [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
$root     = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$py       = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { $py = 'python' }

if (-not $NoFix) {
  Write-Host '>>> Ensuring login works (fix_login.ps1)...' -ForegroundColor Cyan
  try { & (Join-Path $PSScriptRoot 'fix_login.ps1') } catch { Write-Host "   (login reset skipped: $_)" -ForegroundColor Yellow }
}

# 1) Backend with an auto-restart wrapper, in its own window.
Write-Host ">>> Starting BACKEND on :$Port (auto-restart)..." -ForegroundColor Cyan
$backendCmd = @"
Set-Location '$backend'
`$Host.UI.RawUI.WindowTitle = 'JORINOVA NEXUS — Backend :$Port'
while (`$true) {
  Write-Host '>>> uvicorn main:app --port $Port' -ForegroundColor Green
  & '$py' -m uvicorn main:app --host 0.0.0.0 --port $Port
  Write-Host '!! Backend exited — restarting in 2s (Ctrl+C twice to stop)' -ForegroundColor Yellow
  Start-Sleep -Seconds 2
}
"@
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $backendCmd | Out-Null

# 2) Wait for health.
Write-Host '>>> Waiting for the backend to answer /api/v1/health ...' -ForegroundColor Cyan
$ok = $false
foreach ($i in 1..40) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/v1/health" -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Milliseconds 750 }
}
if ($ok) { Write-Host '>>> Backend is UP.' -ForegroundColor Green }
else     { Write-Host '!! Backend did not answer in ~30s — check its window for errors.' -ForegroundColor Red }

# 3) Frontend, in its own window.
Write-Host '>>> Starting FRONTEND (Next.js)...' -ForegroundColor Cyan
$feScript = if (Test-Path (Join-Path $frontend '.next')) { 'npm run start' } else { 'npm run dev' }
$frontendCmd = @"
Set-Location '$frontend'
`$Host.UI.RawUI.WindowTitle = 'JORINOVA NEXUS — Frontend :3000'
$feScript
"@
Start-Process powershell -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCmd | Out-Null

# 4) Optional ngrok tunnel for phone access.
if ($Tunnel) {
  Write-Host '>>> Opening ngrok tunnel (phone access)...' -ForegroundColor Cyan
  try { & (Join-Path $PSScriptRoot 'start_tunnel.ps1') -Port $Port } catch { Write-Host "   (tunnel skipped: $_)" -ForegroundColor Yellow }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host '  App:      http://localhost:3000' -ForegroundColor Green
Write-Host "  Backend:  http://localhost:$Port/api/v1/health" -ForegroundColor Green
Write-Host '  Login:    admin / Admin@2026' -ForegroundColor Green
Write-Host '  If a window shows an error, that is the real cause of any 502.' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
