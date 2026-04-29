#!/usr/bin/env bash
# Superseded by fix-ollama-mac.sh, which is more aggressive and verifies CORS
# with curl after restarting Ollama. This shim keeps the old name working.
exec "$(dirname "$0")/fix-ollama-mac.sh" "$@"
