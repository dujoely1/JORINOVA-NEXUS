<#
  Terminal 1 — JORINOVA NEXUS backend.
  Always runs from the backend folder, so `uvicorn main:app` can import main.py
  (fixes "Could not import module main" and system32 confusion).

  Run:
    powershell -ExecutionPolicy Bypass -File "D:\JORINOVA NEXUS\deploy\start_backend.ps1"
#>
$ErrorActionPreference = 'Stop'
$Backend = 'D:\JORINOVA NEXUS\backend'

if (-not (Test-Path (Join-Path $Backend 'main.py'))) {
    throw "main.py not found in $Backend - is the project at D:\JORINOVA NEXUS ?"
}
Set-Location $Backend
Write-Host ">>> Working dir: $Backend" -ForegroundColor Cyan
Write-Host ">>> Starting FastAPI on http://0.0.0.0:8000  (Ctrl+C to stop)" -ForegroundColor Cyan
python -m uvicorn main:app --host 0.0.0.0 --port 8000
