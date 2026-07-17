# JORINOVA NEXUS — install Ollama + pull the hybrid AI models (Windows)
# ---------------------------------------------------------------------------
# Gives the app fully-offline generative AI. Needs a machine with >= 8 GB RAM
# and ~16 GB free disk. After this, set AI_MODE=auto (default) so the backend
# uses Ollama when the internet/Claude is unavailable, and Claude when it is.
#
#   powershell -ExecutionPolicy Bypass -File deploy\setup_ollama.ps1
$ErrorActionPreference = 'Stop'

# Must match core/config.py ollama_model_* (fast/deep/chat/general/fallback)
$models = @('phi3:mini', 'mistral', 'nous-hermes', 'llama3', 'tinyllama')

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing Ollama via winget...'
  winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
  $env:Path += ';' + "$env:LOCALAPPDATA\Programs\Ollama"
}

Write-Host 'Starting the Ollama server...'
Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
Start-Sleep -Seconds 4

foreach ($m in $models) {
  Write-Host "Pulling $m ..."
  ollama pull $m
}

Write-Host ''
Write-Host 'All models pulled. Installed models:'
ollama list
Write-Host ''
Write-Host 'Backend env: OLLAMA_URL=http://localhost:11434 (default), AI_MODE=auto.'
Write-Host 'Force local-only with AI_MODE=offline; prefer cloud with AI_MODE=cloud.'
