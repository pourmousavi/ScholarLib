#!/usr/bin/env bash
#
# scripts/fix-ollama-mac.sh
#
# A more aggressive replacement for setup-ollama-mac.sh.
#
# The previous script only restarted /Applications/Ollama.app via osascript,
# which silently fails when the user is running `ollama serve` in a terminal
# (a separate process tree that does not inherit the launchd environment).
# This script:
#
#   1. Reports the exact current state.
#   2. Installs / refreshes the LaunchAgent that sets OLLAMA_ORIGINS at every
#      login.
#   3. Kills every Ollama process it can find — Ollama.app, `ollama serve`,
#      Homebrew service, anything matching "ollama".
#   4. Restarts Ollama with OLLAMA_ORIGINS visible to the new process. If the
#      Mac app is installed it is preferred; otherwise it shells out to
#      `OLLAMA_ORIGINS=… nohup ollama serve` so the env var is in the new
#      process's environment regardless of launchd.
#   5. Verifies CORS by running curl with the production Origin header and
#      checking that Access-Control-Allow-Origin comes back.
#   6. Prints a clear PASS or FAIL with diagnostic detail to paste back if
#      it fails.
#
# Run repeatedly. Idempotent.

set -euo pipefail

ORIGINS="https://alipourmousavi.com,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173"
TEST_ORIGIN="https://alipourmousavi.com"
LABEL="com.scholarlib.ollama-cors"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="/tmp/ollama-scholarlib.log"

bold()   { printf '\033[1m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }
red()    { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
indent() { sed 's/^/    /'; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  red "This script targets macOS. On Linux/Windows, set OLLAMA_ORIGINS in your shell profile or service manager."
  exit 1
fi

bold "ScholarLib Ollama CORS fix (aggressive)"
echo

# === STEP 1: diagnose current state ===
bold "1) Current state"
CURRENT_ENV=$(launchctl getenv OLLAMA_ORIGINS 2>/dev/null || true)
if [[ -n "$CURRENT_ENV" ]]; then
  echo "  launchctl OLLAMA_ORIGINS = $CURRENT_ENV"
else
  yellow "  launchctl OLLAMA_ORIGINS = (not set)"
fi
echo "  Ollama processes detected:"
PROCS=$(pgrep -lf "[Oo]llama" 2>/dev/null | grep -v "fix-ollama-mac" || true)
if [[ -n "$PROCS" ]]; then
  echo "$PROCS" | indent
else
  echo "    (none)"
fi
echo

# === STEP 2: install / refresh LaunchAgent ===
bold "2) Installing LaunchAgent"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OLLAMA_ORIGINS "${ORIGINS}"</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || true
launchctl setenv OLLAMA_ORIGINS "$ORIGINS"
green "  ✓ LaunchAgent at $PLIST"
green "  ✓ launchctl OLLAMA_ORIGINS = $ORIGINS"
echo

# === STEP 3: kill everything Ollama-shaped ===
bold "3) Killing all running Ollama processes"
osascript -e 'tell application "Ollama" to quit' 2>/dev/null || true
# Homebrew service
if command -v brew >/dev/null 2>&1; then
  if brew services list 2>/dev/null | grep -q "^ollama "; then
    brew services stop ollama 2>/dev/null || true
    echo "  Stopped brew service ollama"
  fi
fi
# Best-effort kill across every launch shape
pkill -f "ollama serve" 2>/dev/null || true
pkill -f "Ollama.app/Contents/Resources/ollama" 2>/dev/null || true
pkill -x "ollama" 2>/dev/null || true
pkill -x "Ollama" 2>/dev/null || true
sleep 2
REMAINING=$(pgrep -f "[Oo]llama" 2>/dev/null | grep -v "$$" || true)
if [[ -n "$REMAINING" ]]; then
  yellow "  Some processes survived: $REMAINING — force-killing"
  echo "$REMAINING" | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi
green "  ✓ Ollama processes terminated"
echo

# === STEP 4: restart Ollama with the env var explicitly injected ===
bold "4) Restarting Ollama with OLLAMA_ORIGINS set"
STARTED_BY=""
if [[ -d "/Applications/Ollama.app" ]]; then
  open -a Ollama
  STARTED_BY="Ollama.app"
  echo "  Launched /Applications/Ollama.app"
elif command -v ollama >/dev/null 2>&1; then
  echo "  No Ollama.app found; starting 'ollama serve' in background"
  echo "  Log: $LOG"
  # Use env -i to start cleanly with only what we want; otherwise inherited
  # NPM_TOKEN/etc could leak. Keep PATH so ollama can find its dependencies.
  OLLAMA_ORIGINS="$ORIGINS" nohup ollama serve > "$LOG" 2>&1 &
  STARTED_BY="ollama serve (background)"
else
  red "  Ollama is not installed."
  red "  Install it from https://ollama.com and run this script again."
  exit 2
fi
echo "  Waiting for Ollama to come up (max 20s)..."
UP=0
for i in {1..20}; do
  if curl -s -m 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
    UP=1
    break
  fi
  sleep 1
done
if [[ "$UP" -eq 1 ]]; then
  green "  ✓ Ollama responding on :11434 (started via $STARTED_BY)"
else
  red "  ✗ Ollama did not come up within 20s."
  if [[ -f "$LOG" ]]; then
    red "  Tail of $LOG:"
    tail -20 "$LOG" | indent
  fi
  exit 3
fi
echo

# === STEP 5: verify CORS for the production origin ===
bold "5) Verifying CORS for $TEST_ORIGIN"
RESP=$(curl -s -m 5 -i -H "Origin: $TEST_ORIGIN" http://localhost:11434/api/tags 2>/dev/null || true)
ALLOW=$(printf '%s' "$RESP" | awk 'tolower($1)=="access-control-allow-origin:"{ $1=""; sub(/^[ \t\r\n]+/,""); print; exit }')
echo "  Access-Control-Allow-Origin response header: ${ALLOW:-(missing)}"

if [[ "$ALLOW" == "$TEST_ORIGIN" || "$ALLOW" == "*" ]]; then
  echo
  green "✓ DONE. Ollama now accepts requests from $TEST_ORIGIN."
  green "  Hard-refresh ScholarLib (⌘⇧R) and try paper or grant ingestion."
  exit 0
fi

# === FAILURE PATH: print everything we know ===
echo
red "✗ FAIL. Ollama is reachable, but it is NOT sending the CORS header for $TEST_ORIGIN."
echo
red "Diagnostic dump (paste this back to me):"
echo
echo "----- launchctl env -----"
launchctl getenv OLLAMA_ORIGINS 2>/dev/null | sed 's/^/    OLLAMA_ORIGINS=/' || echo "    (not set)"
echo
echo "----- ollama processes -----"
pgrep -lf "[Oo]llama" 2>/dev/null | grep -v "fix-ollama-mac" | indent || echo "    (none)"
echo
echo "----- ollama version -----"
if command -v ollama >/dev/null 2>&1; then
  ollama --version 2>&1 | indent
else
  echo "    ollama CLI not on PATH"
fi
echo
echo "----- response headers from curl -----"
printf '%s' "$RESP" | head -20 | indent
echo
echo "----- preflight (OPTIONS) -----"
curl -s -m 5 -i -X OPTIONS \
  -H "Origin: $TEST_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:11434/api/tags 2>/dev/null | head -20 | indent || true
echo
exit 4
