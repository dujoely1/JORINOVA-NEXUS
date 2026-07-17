#!/usr/bin/env bash
# JORINOVA NEXUS — install Ollama + pull the hybrid AI models (Linux/macOS)
# ---------------------------------------------------------------------------
# Gives the app fully-offline generative AI. Needs a host with >= 8 GB RAM and
# ~16 GB free disk (NOT Render free tier). After this, set AI_MODE=auto so the
# backend uses Ollama when the internet/Claude is down, and Claude when it's up.
#
#   bash deploy/setup_ollama.sh
set -euo pipefail

# Must match core/config.py ollama_model_* (fast/deep/chat/general/fallback)
MODELS=(phi3:mini mistral nous-hermes llama3 tinyllama)
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

if ! command -v ollama >/dev/null 2>&1; then
  echo 'Installing Ollama...'
  curl -fsSL https://ollama.com/install.sh | sh
fi

# Start the server if it isn't already answering
if ! curl -fsS "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
  echo 'Starting the Ollama server...'
  (ollama serve >/tmp/ollama.log 2>&1 &)
  sleep 4
fi

for m in "${MODELS[@]}"; do
  echo "Pulling ${m} ..."
  ollama pull "${m}"
done

echo ''
echo 'All models pulled. Installed models:'
ollama list
echo ''
echo "Backend env: OLLAMA_URL=${OLLAMA_URL}, AI_MODE=auto (default)."
echo 'Force local-only with AI_MODE=offline; prefer cloud with AI_MODE=cloud.'
