<#
  Terminal 2 — ngrok HTTPS tunnel to the backend (port 8000).

  First time only (no token in logs - you paste it yourself):
    ngrok config add-authtoken <YOUR_AUTHTOKEN>

  Run (random URL, stable for the whole session):
    powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\start_tunnel.ps1"

  Or with your free reserved domain (same URL every time):
    powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\start_tunnel.ps1" -Domain your-name.ngrok-free.app
#>
param(
    [string]$Domain = '',
    [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'

$ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
if (-not $ngrok) {
    $ngrok = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
}
if (-not (Test-Path $ngrok)) { throw 'ngrok not found. Install: winget install Ngrok.Ngrok ; then run "ngrok update".' }

# warn if backend is not up yet (tunnel still starts, but nothing to serve)
try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/v1/health" -TimeoutSec 3
    Write-Host ">>> Backend detected on :$Port - good." -ForegroundColor Green
} catch {
    Write-Host "!! Backend not answering on :$Port yet. Start Terminal 1 (start_backend.ps1) first." -ForegroundColor Yellow
}

Write-Host (">>> ngrok " + (& $ngrok version)) -ForegroundColor Cyan
if ($Domain) {
    Write-Host ">>> Stable URL: https://$Domain  (Ctrl+C to stop)" -ForegroundColor Green
    & $ngrok http "--domain=$Domain" $Port
} else {
    Write-Host ">>> Random session URL will appear below as 'Forwarding https://....ngrok-free.app'" -ForegroundColor Green
    & $ngrok http $Port
}
