# ScholarLib — Your Setup Tasks (Ali)

This document lists everything YOU need to do manually before or during the build. Claude Code cannot do these — they require your accounts, credentials, and decisions.

Mark each item ✅ when complete.

---

## Phase 1 — Before Starting Stage 01

### 1.1 Create GitHub Repository
- [ ] Go to github.com → New repository
- [ ] Name: `scholarlib` (or your preferred name)
- [ ] Visibility: **Private** (important — keeps your .env history safe)
- [ ] Add README: No (the build will create this)
- [ ] Copy the repo URL and provide it to Claude Code when asked

### 1.2 Install Required Tools on Mac
```bash
# Install Node.js (if not already installed)
brew install node

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Verify
node --version    # should be 18+
git --version
```

### 1.3 Install Ollama on Mac
- [ ] Download from https://ollama.ai
- [ ] **Important:** Set up with CORS enabled (required for web apps):

```bash
# Quit Ollama if running
pkill -f ollama

# Create LaunchAgent for automatic startup with CORS
cat > ~/Library/LaunchAgents/com.ollama.serve.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/ollama</string>
        <string>serve</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_ORIGINS</key>
        <string>*</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Load it (starts now and on every login)
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
```

- [ ] Download required models:
```bash
ollama pull llama3.2          # ~2GB — main LLM
ollama pull nomic-embed-text  # ~270MB — embeddings
```
- [ ] Verify: `curl http://localhost:11434/api/tags`

⚠️ **Note:** After setting up the LaunchAgent, don't open Ollama.app - the LaunchAgent handles everything.

### 1.4 Install Ollama on Windows (University PC)
Try the portable method first (no admin needed):
- [ ] Download `ollama-windows-amd64.zip` from https://github.com/ollama/ollama/releases
- [ ] Extract to `C:\Users\[YourName]\ollama\`
- [ ] Set CORS environment variable:
  - Open Start → Search "environment variables" → "Environment Variables..."
  - Under "User variables", click "New"
  - Name: `OLLAMA_ORIGINS`, Value: `*`
  - Click OK
- [ ] Run `ollama.exe serve` from that folder
- [ ] If blocked by IT: use WebLLM in browser instead (configured in Settings, Stage 12)
- [ ] Pull same models as Mac if portable method works

---

## Phase 2 — Before Starting Stage 06 (Storage)

### 2.1 Create Box Developer App
- [ ] Go to https://developer.box.com
- [ ] Sign in with your University Box account
- [ ] Create App → Custom App → OAuth 2.0
- [ ] App name: `ScholarLib`
- [ ] Redirect URIs — add ALL of these:
  ```
  https://[yourusername].github.io/scholarlib/auth/box
  http://localhost:5173/auth/box
  http://localhost:4173/auth/box
  ```
- [ ] Scopes: check `Read all files and folders` + `Write all files and folders` + `Manage users`
- [ ] Copy **Client ID** → save as `VITE_BOX_CLIENT_ID` in `.env.local`
- [ ] Copy **Client Secret** → save securely (NOT in .env.local — only needed server-side, not used in this app)

⚠️ Note: If your University Box uses SSO, you may need IT to approve the app. Contact ServiceDesk and ask to register a Box OAuth app for research purposes.

### 2.2 Create Dropbox App (optional — for collaborator flexibility)
- [ ] Go to https://www.dropbox.com/developers/apps
- [ ] Create App → Scoped Access → Full Dropbox
- [ ] App name: `ScholarLib`
- [ ] Redirect URI: same as Box above, but `/auth/dropbox`
- [ ] Copy **App key** → save as `VITE_DROPBOX_APP_KEY` in `.env.local`

### 2.3 Create `.env.local` file in repo root
```bash
# In your scholarlib/ repo folder:
cat > .env.local << 'EOF'
VITE_BOX_CLIENT_ID=paste_your_box_client_id_here
VITE_BOX_REDIRECT_URI=https://[yourusername].github.io/scholarlib/auth/box
VITE_DROPBOX_APP_KEY=paste_your_dropbox_key_here
VITE_WORKER_URL=https://scholarlib-api.[your-subdomain].workers.dev
VITE_APP_BASE_URL=https://[yourusername].github.io/scholarlib
EOF
```

Replace `[yourusername]` with your GitHub username and `[your-subdomain]` with your Cloudflare username.

⚠️ `.env.local` must be in `.gitignore` — Stage 01 sets this up automatically.

---

## Phase 3 — Before Starting Stage 13 (Cloudflare Worker)

### 3.1 Create Cloudflare Account
- [ ] Go to https://cloudflare.com → Sign up (free)
- [ ] Use personal email (not university, to avoid IT complications)

### 3.2 Install Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 3.3 Create KV Namespaces (run these commands)
```bash
cd scholarlib/worker

wrangler kv:namespace create "SHARES"
wrangler kv:namespace create "ACCESS"  
wrangler kv:namespace create "LOGS"
```
- [ ] Copy the `id` values from each command output
- [ ] Claude Code will ask you to paste these into `wrangler.toml` during Stage 13

### 3.4 (Optional) Set up Resend for invitation emails
- [ ] Go to https://resend.com → free tier (3,000 emails/month)
- [ ] Create API key
- [ ] Add to Cloudflare Worker secrets: `wrangler secret put RESEND_API_KEY`

---

## Phase 4 — GitHub Pages Setup (Stage 01 handles most of this)

### 4.1 Enable GitHub Pages
After Stage 01 first deployment:
- [ ] Go to repo → Settings → Pages
- [ ] Source: **GitHub Actions** (not branch)
- [ ] Wait for first deploy to complete
- [ ] Note your URL: `https://[yourusername].github.io/scholarlib`

### 4.2 Set GitHub Repository Secrets
Go to repo → Settings → Secrets and variables → Actions:
- [ ] Add `VITE_BOX_CLIENT_ID` (same value as .env.local)
- [ ] Add `VITE_BOX_REDIRECT_URI`
- [ ] Add `VITE_DROPBOX_APP_KEY`
- [ ] Add `VITE_WORKER_URL` (add this after Stage 13)

These are used by the CI/CD pipeline to inject env vars at build time.

---

## Phase 5 — PWA Installation (After Stage 16)

### On Mac (Chrome or Edge)
- [ ] Open https://[yourusername].github.io/scholarlib
- [ ] Look for install icon in address bar → Install
- [ ] App appears in Applications folder and Dock

### On Windows
- [ ] Open in Edge → ... menu → Apps → Install ScholarLib
- [ ] Or in Chrome → install icon in address bar

### On iPad
- [ ] Open in Safari
- [ ] Tap Share button → Add to Home Screen
- [ ] ScholarLib appears as app icon

---

## Ongoing Maintenance (Your Responsibility)

### Box access tokens
Box refresh tokens expire after 60 days of non-use. If you haven't opened the app in 60 days, you'll need to reconnect Box. The app will prompt you automatically.

### Cloudflare Worker
Free tier includes 100,000 requests/day and 1 GB KV storage — more than enough for personal use. No maintenance needed unless Cloudflare changes their free tier.

### Ollama models
Occasionally run `ollama pull llama3.2` to get model updates. Models are stored in `~/.ollama/models/`.

### GitHub Actions
The build runs automatically on every push to `main`. If a build fails, check the Actions tab in your repo for error logs.

---

## Decision Log (Confirm These With Claude Code)

Before starting certain stages, confirm your preferences:

| Stage | Decision | Default | Your choice |
|-------|----------|---------|-------------|
| 01 | GitHub username for Pages URL | — | ____________ |
| 06 | Primary storage provider | Box | ____________ |
| 09 | Default AI model | llama3.2 | ____________ |
| 13 | Worker subdomain | scholarlib-api | ____________ |
| 14 | Send invite emails via Resend? | No | ____________ |
| 16 | App display name on home screen | ScholarLib | ____________ |

---

## Sharing With Collaborators

Once the app is deployed, sharing is simple:

1. Send them the URL: `https://[yourusername].github.io/scholarlib`
2. They open it, choose their storage (Box or Dropbox), connect their account
3. You share a folder with them from inside the app (Stage 14)
4. They see only what you've shared; their own uploads are private

Students who want AI features can either:
- Install Ollama on their own machine (free)
- Use WebLLM in Chrome (free, no install)
- Enter their own Claude/OpenAI API key in Settings (their cost)
