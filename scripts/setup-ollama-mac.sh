#!/usr/bin/env bash
#
# scripts/setup-ollama-mac.sh
#
# One-time setup so Ollama on macOS accepts requests from ScholarLib without
# manual terminal hacks every reboot.
#
# What this does
# --------------
# 1. Writes a LaunchAgent at ~/Library/LaunchAgents/com.scholarlib.ollama-cors.plist
#    that runs `launchctl setenv OLLAMA_ORIGINS "..."` at every login.
# 2. Loads the LaunchAgent now so it takes effect immediately.
# 3. Sets the env var in the current launchd session as well, so you do not
#    have to log out and back in.
# 4. Quits and re-opens the Ollama menu-bar app so it picks up the new env var.
#
# Why a LaunchAgent
# -----------------
# `launchctl setenv` only persists until logout. Without a LaunchAgent the
# CORS error returns after every reboot. The plist is the durable fix.
#
# Why these origins
# -----------------
# OLLAMA_ORIGINS is a comma-separated allowlist. Anything not on the list is
# rejected with a CORS error and the browser refuses the response. We include:
#
#   - https://alipourmousavi.com   the production GitHub Pages deploy
#   - http://localhost:5173        Vite dev server
#   - http://localhost:4173        Vite preview server
#   - http://127.0.0.1:5173        same as above, IP form
#   - http://127.0.0.1:4173        same as above, IP form
#
# To add or remove an origin, edit the ORIGINS variable below and re-run.
#
# Rollback
# --------
#   launchctl unload ~/Library/LaunchAgents/com.scholarlib.ollama-cors.plist
#   rm ~/Library/LaunchAgents/com.scholarlib.ollama-cors.plist
#   launchctl unsetenv OLLAMA_ORIGINS
#
# Verification
# ------------
#   launchctl getenv OLLAMA_ORIGINS
#
# After running this script the wiki ingestion CORS error should not return
# even across reboots.

set -euo pipefail

LABEL="com.scholarlib.ollama-cors"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
ORIGINS="https://alipourmousavi.com,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: this script targets macOS." >&2
  echo "On Linux: add 'export OLLAMA_ORIGINS=\"$ORIGINS\"' to your shell profile." >&2
  echo "On Windows: set OLLAMA_ORIGINS via System Properties -> Environment Variables." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

echo "Writing LaunchAgent: $PLIST_PATH"
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/sh</string>
      <string>-c</string>
      <string>launchctl setenv OLLAMA_ORIGINS "${ORIGINS}"</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
EOF

echo "Reloading LaunchAgent..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "Applying to current session..."
launchctl setenv OLLAMA_ORIGINS "$ORIGINS"

echo "Restarting Ollama so it picks up the new env var..."
osascript -e 'tell application "Ollama" to quit' 2>/dev/null || true
# Ollama can take a moment to fully shut down its server.
sleep 2

if [[ -d "/Applications/Ollama.app" ]]; then
  open -a Ollama
  echo "Ollama menu-bar app re-launched."
elif command -v ollama >/dev/null 2>&1; then
  echo "Note: Ollama CLI detected but no Ollama.app at /Applications/Ollama.app."
  echo "If you run 'ollama serve' manually, kill it now and restart it so it sees OLLAMA_ORIGINS."
else
  echo "Note: Ollama is not installed. Install it from https://ollama.com first, then run this script again."
fi

echo
echo "✓ OLLAMA_ORIGINS = $ORIGINS"
echo "✓ LaunchAgent will re-apply this at every login."
echo
echo "Verify:  launchctl getenv OLLAMA_ORIGINS"
echo
echo "If CORS errors still appear, fully quit Ollama (menu bar → Quit, not just close)"
echo "and reopen it. Browser cache reload (Cmd-Shift-R) helps too."
