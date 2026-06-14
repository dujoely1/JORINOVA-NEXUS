<#
  JORINOVA NEXUS pilot with a STABLE, FREE HTTPS domain via ngrok.

  ngrok's free plan includes ONE permanent "static domain" (e.g.
  https://your-name.ngrok-free.app) that does NOT change on restart and costs
  nothing. This script runs the backend (:8000) and exposes it on that domain.

  ONE-TIME FREE SETUP (you do this, ~2 min, no payment):
    1. Create a free account: https://dashboard.ngrok.com/signup
    2. Copy your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
    3. Claim your free static domain: https://dashboard.ngrok.com/domains
       (click "New Domain" -> it gives you a free *.ngrok-free.app name)

  THEN run (first time, pass both; afterwards just -Domain):
    powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\run_pilot_ngrok.ps1" -Domain your-name.ngrok-free.app -AuthToken <YOUR_TOKEN>
#>
param(
    [Parameter(Mandatory = $true)][string]$Domain,
    [string]$AuthToken = '',
    [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'
$Backend = 'D:\JORINOVA NEXUS\backend'
function Info($m){ Write-Host ">>> $m" -ForegroundColor Cyan }

# locate ngrok (PATH or winget shim)
$ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue)
$ngrokExe = if ($ngrok) { $ngrok.Source } else { "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe" }
if (-not (Test-Path $ngrokExe)) { throw 'ngrok not found. Open a NEW terminal (winget updated PATH) or reinstall: winget install Ngrok.Ngrok' }

# one-time authtoken
if ($AuthToken) {
    Info 'Saving ngrok authtoken...'
    & $ngrokExe config add-authtoken $AuthToken | Out-Null
}

# ensure backend is running on :8000
function Test-Backend {
    try { return (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/v1/health" -TimeoutSec 3).StatusCode -eq 200 } catch { return $false }
}
if (Test-Backend) { Info "Backend already running on :$Port." }
else {
    Info "Starting backend on :$Port ..."
    Start-Process -FilePath 'python' -ArgumentList '-m','uvicorn','main:app','--host','0.0.0.0','--port',"$Port" -WorkingDirectory $Backend -WindowStyle Minimized
    for ($i=0; $i -lt 30; $i++){ Start-Sleep 2; if (Test-Backend){ break } }
    if (Test-Backend) { Info 'Backend is UP.' } else { throw 'Backend did not start - check the minimized python window.' }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host " STABLE HTTPS URL : https://$Domain" -ForegroundColor Green
Write-Host " MOBILE API_BASE_URL : https://$Domain/api/v1/" -ForegroundColor Green
Write-Host " (this domain NEVER changes - build the APK once against it)" -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host ''
Info "Starting ngrok tunnel on https://$Domain (Ctrl+C to stop)..."
& $ngrokExe http "--domain=$Domain" $Port
