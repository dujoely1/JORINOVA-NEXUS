<#
  Permanent domain for the Jorinova Nexus API via a NAMED Cloudflare tunnel.
  Turns the throwaway https://*.trycloudflare.com into a STABLE host such as
  https://api.jorinova.com that survives restarts.

  PREREQUISITES (you do these once, they need YOUR Cloudflare login + domain):
    1. Own a domain and add it to Cloudflare (DNS managed by Cloudflare).
    2. Run ONCE (opens a browser to pick the domain):
           cloudflared tunnel login
       This writes a cert.pem into  %USERPROFILE%\.cloudflared\

  THEN run this script (creates the tunnel, routes DNS, writes config, runs it):
       powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\cloudflared_named_tunnel.ps1" -Hostname api.jorinova.com
#>
param(
    [string]$Hostname = 'api.jorinova.com',
    [string]$TunnelName = 'jorinova-api',
    [int]$LocalPort = 8000,
    [switch]$InstallService
)
$ErrorActionPreference = 'Stop'
function Info($m){ Write-Host ">>> $m" -ForegroundColor Cyan }

# locate cloudflared (PATH or the one the pilot launcher downloaded)
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue)
$cfPath = if ($cf) { $cf.Source } else { 'D:\JORINOVA NEXUS\deploy\cloudflared.exe' }
if (-not (Test-Path $cfPath)) { throw "cloudflared not found. Run run_pilot_windows.ps1 once (it downloads it) or install cloudflared." }

$cfDir = Join-Path $env:USERPROFILE '.cloudflared'
if (-not (Test-Path (Join-Path $cfDir 'cert.pem'))) {
    throw "Not logged in. Run first:  `"$cfPath`" tunnel login   (pick your domain in the browser)."
}

# create the tunnel if it does not already exist
Info "Ensuring tunnel '$TunnelName' exists..."
$list = & $cfPath tunnel list 2>$null
if ($list -notmatch [regex]::Escape($TunnelName)) {
    & $cfPath tunnel create $TunnelName
}

# resolve the tunnel UUID
$idLine = (& $cfPath tunnel list 2>$null | Select-String -Pattern $TunnelName | Select-Object -First 1).ToString()
$uuid = ([regex]'[0-9a-fA-F-]{36}').Match($idLine).Value
if (-not $uuid) { throw "Could not resolve tunnel UUID for $TunnelName." }
Info "Tunnel UUID: $uuid"

# write config.yml (ingress: hostname -> local backend)
$credFile = Join-Path $cfDir "$uuid.json"
$configPath = Join-Path $cfDir 'config.yml'
$config = @"
tunnel: $uuid
credentials-file: $credFile

ingress:
  - hostname: $Hostname
    service: http://localhost:$LocalPort
  - service: http_status:404
"@
[System.IO.File]::WriteAllText($configPath, $config, (New-Object System.Text.UTF8Encoding($false)))
Info "Wrote $configPath"

# route the DNS record for the hostname to this tunnel
Info "Routing DNS $Hostname -> $TunnelName ..."
& $cfPath tunnel route dns $TunnelName $Hostname 2>$null

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Permanent API host : https://$Hostname" -ForegroundColor Green
Write-Host " Backend mapped to  : http://localhost:$LocalPort" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

if ($InstallService) {
    Info "Installing cloudflared as a Windows service (auto-start on boot)..."
    & $cfPath service install
    Write-Host "Service installed. The tunnel will run on boot." -ForegroundColor Green
} else {
    Info "Starting tunnel now (Ctrl+C to stop). Use -InstallService to run on boot."
    & $cfPath tunnel run $TunnelName
}
