# Stage 12 — Settings Panel (All Sections)

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Build the complete Settings panel with all sections. Settings stored in Box (settings.json) for cross-device preferences, and localStorage for device-specific items (API keys, AI provider).

## Claude Code Tasks

### 1. `src/services/settings/SettingsService.js`
```javascript
class SettingsService {
  async load(adapter) {
    const remote = await adapter.readJSON('_system/settings.json').catch(() => this.defaults())
    const deviceId = this.getDeviceId()
    const local = {
      ai_provider: localStorage.getItem('sv_ai_provider') || 'none',
      ai_model: localStorage.getItem('sv_ai_model') || 'llama3.2',
      claude_key_set: !!localStorage.getItem('sv_claude_key'),
      openai_key_set: !!localStorage.getItem('sv_openai_key'),
    }
    return { remote, local, deviceId }
  }

  async save(adapter, globalSettings) {
    const existing = await adapter.readJSON('_system/settings.json').catch(() => this.defaults())
    existing.global = { ...existing.global, ...globalSettings }
    existing.devices[this.getDeviceId()] = {
      device_name: this.getDeviceName(),
      last_seen: new Date().toISOString(),
      ai_provider: localStorage.getItem('sv_ai_provider'),
      ai_model: localStorage.getItem('sv_ai_model'),
    }
    await adapter.writeJSON('_system/settings.json', existing)
  }

  getDeviceId() {
    let id = localStorage.getItem('sv_device_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('sv_device_id', id)
    }
    return id
  }

  getDeviceName() {
    const ua = navigator.userAgent
    if (/iPad/.test(ua)) return 'iPad'
    if (/Mac/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    return 'Browser'
  }
}
```

### 2. `src/components/settings/SettingsModal.jsx` + `SettingsModal.module.css`
Modal using the Modal base component. Left nav + right content panel. Sections:

#### Section: AI & Models
- Provider radio options: Ollama (local), WebLLM (browser), Claude API, OpenAI API, None
- Ollama: shows connection status + "Test connection" button + Ollama download link
- WebLLM: shows download status + model size + "Download model" button
- Claude API: password input for key + "Test key" button + model selector (Haiku / Sonnet)
- OpenAI API: password input for key + "Test key" button + model selector (gpt-4o-mini / gpt-4o)
- Cost warning for cloud APIs

API key save: `localStorage.setItem('sv_claude_key', key)` — explicitly tell user it stays on this device only.

#### Section: Storage
- Current provider display (Box / Dropbox)
- Box: shows authenticated email, storage quota (if API provides it)
- "Disconnect" button (with confirmation: "This will sign you out. Your data remains in Box.")
- "Switch provider" option

#### Section: Metadata
- Extraction mode: radio (Auto / Review / Manual) — maps to settings.json `metadata_extraction_mode`
- Extraction sources: toggles for each source in the pipeline (PDF embedded / CrossRef / Semantic Scholar / AI)
- "Add User-Agent email for CrossRef" — input for email to improve CrossRef rate limits

#### Section: Account & Sharing
- Display name and email (read from Box profile)
- Collaborators I've added (list with revoke buttons — wires to Stage 14)
- Folders shared with me (list)

#### Section: Appearance
- Theme: Dark (default) / Light (implement light theme tokens in Stage 17)
- Sidebar: Show/hide document counts toggle
- Font size: Normal / Large (scales --text-base CSS variable)
- PDF: Default zoom level (75% / 100% / 125%)

#### Section: Export & Privacy
- Default export format selector
- Chat export options (toggles per chat_export settings in schema)
- Privacy statement (Box storage, Worker logging only)
- "Clear all AI chat history" button (with confirmation)
- "Re-index all documents" button

### 3. Settings persistence flow
On Settings modal close:
1. Changed global settings → `settingsService.save(adapter, changedGlobal)`
2. Changed AI provider → `localStorage.setItem` + `aiStore.setProvider()`
3. Changed API keys → `localStorage.setItem` only
4. Show Toast: "Settings saved"

### 4. "Test connection" for Ollama
```javascript
async testOllama() {
  const available = await ollamaService.isAvailable()
  if (available) {
    const tags = await fetch('http://localhost:11434/api/tags').then(r => r.json())
    showToast({ message: `✓ Ollama connected — ${tags.models.length} models available`, type: 'success' })
  } else {
    showToast({ message: 'Cannot reach Ollama — is it running?', type: 'error' })
  }
}
```

### 5. Wire settings button
⚙ button in sidebar footer opens SettingsModal (setShowModal('settings') in uiStore).

## Verification
- Open settings from sidebar
- Change AI provider — sidebar AI status dot updates
- Enter API key — persists after refresh
- Metadata mode change — persists to Box

## Commit
```bash
git commit -m "feat: complete settings panel — AI config, storage, metadata, appearance, export"
```

---

# Stage 13 — Cloudflare Worker Backend

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`

## Goal
Implement and deploy the Cloudflare Worker that handles access control, sharing management, and activity logging.

## Prerequisites (Ali must complete first)
- Cloudflare account created
- Wrangler CLI installed and logged in
- KV namespaces created (see `docs/USER_SETUP.md` §3.1–3.3)
- KV namespace IDs available

## Claude Code Tasks

### 1. Initialize worker project
```bash
mkdir -p worker && cd worker
npm init -y
npm install -D wrangler
```

### 2. `worker/wrangler.toml`
```toml
name = "scholarlib-api"
main = "index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "SHARES"
id = "PASTE_SHARES_KV_ID_HERE"

[[kv_namespaces]]
binding = "ACCESS"
id = "PASTE_ACCESS_KV_ID_HERE"

[[kv_namespaces]]
binding = "LOGS"
id = "PASTE_LOGS_KV_ID_HERE"

[vars]
ALLOWED_ORIGINS = "https://[yourusername].github.io,http://localhost:5173"
```

### 3. `worker/index.js`
Complete Worker implementation:

```javascript
export default {
  async fetch(request, env) {
    // CORS
    const origin = request.headers.get('Origin')
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
    if (!allowedOrigins.includes(origin)) {
      return new Response('Forbidden', { status: 403 })
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      let response
      if (path === '/share' && request.method === 'POST') {
        response = await handleCreateShare(request, env)
      } else if (path.startsWith('/share/') && request.method === 'DELETE') {
        response = await handleDeleteShare(request, env, path)
      } else if (path.startsWith('/access/') && request.method === 'GET') {
        response = await handleGetAccess(request, env, path)
      } else if (path === '/log' && request.method === 'POST') {
        response = await handleLog(request, env)
      } else if (path.startsWith('/activity/') && request.method === 'GET') {
        response = await handleGetActivity(request, env, path, url)
      } else if (path === '/token' && request.method === 'POST') {
        response = await handleGetToken(request, env)
      } else {
        response = { error: 'Not found' }
      }
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
}

async function handleCreateShare(request, env) {
  const { folder_path, collaborator_email, permission, expires_at } = await request.json()
  
  // Validate auth (verify the requester owns the folder via Box API)
  const shareId = `sh_${crypto.randomUUID()}`
  const shareKey = `${folder_path}::${collaborator_email}`
  
  await env.SHARES.put(shareId, JSON.stringify({
    folder_path, collaborator_email, permission,
    created_at: new Date().toISOString(),
    expires_at: expires_at || null
  }))
  
  await env.ACCESS.put(shareKey, JSON.stringify({
    share_id: shareId, granted_at: new Date().toISOString(), permission
  }))
  
  return { share_id: shareId }
}

async function handleDeleteShare(request, env, path) {
  const shareId = path.split('/')[2]
  const share = await env.SHARES.get(shareId, 'json')
  if (!share) return { error: 'Share not found' }
  
  const accessKey = `${share.folder_path}::${share.collaborator_email}`
  await env.SHARES.delete(shareId)
  await env.ACCESS.delete(accessKey)
  
  return { deleted: true }
}

async function handleGetAccess(request, env, path) {
  const folderPath = decodeURIComponent(path.split('/access/')[1])
  const list = await env.SHARES.list({ prefix: '' })
  const shares = []
  
  for (const key of list.keys) {
    const share = await env.SHARES.get(key.name, 'json')
    if (share?.folder_path === folderPath) {
      // Get last access time from LOGS
      const logList = await env.LOGS.list({ prefix: `${folderPath}::${share.collaborator_email}::` })
      const lastAccess = logList.keys.sort().pop()?.name.split('::')[2] || null
      shares.push({ ...share, last_accessed: lastAccess, share_id: key.name })
    }
  }
  
  return { collaborators: shares }
}

async function handleLog(request, env) {
  const { action, doc_id, folder_path, collaborator_email } = await request.json()
  const timestamp = new Date().toISOString()
  const key = `${folder_path}::${collaborator_email}::${timestamp}`
  
  await env.LOGS.put(key, JSON.stringify({ action, doc_id, timestamp }), {
    expirationTtl: 60 * 60 * 24 * 90  // 90 days retention
  })
  
  return { logged: true }
}

async function handleGetActivity(request, env, path, url) {
  const folderPath = decodeURIComponent(path.split('/activity/')[1])
  const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z'
  const limit = parseInt(url.searchParams.get('limit') || '50')
  
  const list = await env.LOGS.list({ prefix: `${folderPath}::` })
  const events = []
  
  for (const key of list.keys.filter(k => k.name.split('::')[2] > since).slice(0, limit)) {
    const log = await env.LOGS.get(key.name, 'json')
    const parts = key.name.split('::')
    events.push({ email: parts[1], timestamp: parts[2], ...log })
  }
  
  return { events: events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)) }
}

async function handleGetToken(request, env) {
  // TODO: Exchange for Box read-only token for this collaborator
  // For now: validate access and return a signed JWT
  const { email, folder_path } = await request.json()
  const accessKey = `${folder_path}::${email}`
  const access = await env.ACCESS.get(accessKey, 'json')
  
  if (!access) return { error: 'Access denied' }
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { error: 'Access expired' }
  }
  
  // Return access confirmation (Box token exchange TBD)
  return { authorized: true, permission: access.permission }
}
```

### 4. Auth verification
Every write endpoint (createShare, deleteShare) should verify the requesting user owns the folder. Simplest approach: require the user's Box access token in the Authorization header, then make a Box API call to verify ownership. Implement this as a `verifyOwner(token, folderPath)` helper.

### 5. Deploy
```bash
cd worker
npx wrangler deploy
```
Copy the deployed URL (format: `https://scholarlib-api.[subdomain].workers.dev`).

### 6. Update .env.local and GitHub secrets
```
VITE_WORKER_URL=https://scholarlib-api.[subdomain].workers.dev
```
Add to GitHub secrets too.

### 7. `src/services/sharing/WorkerClient.js`
```javascript
class WorkerClient {
  get baseURL() { return import.meta.env.VITE_WORKER_URL }
  
  async createShare(folderPath, email, permission, boxToken) {
    return this.post('/share', { folder_path: folderPath, collaborator_email: email, permission }, boxToken)
  }
  async deleteShare(shareId, boxToken) {
    return this.delete(`/share/${shareId}`, boxToken)
  }
  async getAccess(folderPath) {
    return this.get(`/access/${encodeURIComponent(folderPath)}`)
  }
  async logAccess(action, docId, folderPath, email) {
    return this.post('/log', { action, doc_id: docId, folder_path: folderPath, collaborator_email: email })
  }
  async getActivity(folderPath, since) {
    return this.get(`/activity/${encodeURIComponent(folderPath)}?since=${since}`)
  }
  
  async post(path, body, authToken) {
    return fetch(this.baseURL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken || ''}` },
      body: JSON.stringify(body)
    }).then(r => r.json())
  }
  async delete(path, authToken) {
    return fetch(this.baseURL + path, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken || ''}` }
    }).then(r => r.json())
  }
  async get(path) {
    return fetch(this.baseURL + path).then(r => r.json())
  }
}
export const workerClient = new WorkerClient()
```

## Verification
```bash
# Test the worker directly:
curl -X POST https://scholarlib-api.[subdomain].workers.dev/log \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"action":"view","doc_id":"d_123","folder_path":"/BESS","collaborator_email":"test@test.com"}'
# Should return: {"logged":true}
```

## Commit
```bash
cd ..  # back to repo root
git add -A
git commit -m "feat: Cloudflare Worker — sharing, access logging, activity API"
```

---

# Stage 14 — Sharing, Collaboration, Activity Dashboard

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`
Also read: `src/services/sharing/WorkerClient.js`

## Goal
Build the sharing UI: share modal, collaborator list, activity dashboard. Wire to Cloudflare Worker.

## Claude Code Tasks

### 1. `src/components/sharing/ShareModal.jsx` + `ShareModal.module.css`
Opened via ⊞ Share button in MainPanel top bar (shares current document's parent folder).

Layout:
```
┌─ Share "Degradation" folder ──────────────────────────────┐
│                                                           │
│  Invite collaborator:                                     │
│  [Email address ________] [Permission ▾] [Send Invite]   │
│                                                           │
│  ─────────────────────────────────────────────────────   │
│  People with access:                                     │
│                                                           │
│  Sahand K.  sahand@adelaide.edu.au  Viewer               │
│  Last accessed: 2 hours ago · 4 documents                │
│  [Revoke access]                                          │
│                                                           │
│  Nam D.     nam@adelaide.edu.au     Viewer               │
│  Last accessed: 3 days ago · 1 document                  │
│  [Revoke access]                                          │
│                                                           │
│  Student X  sx123@student.adelaide.edu.au   Viewer       │
│  ⚠️ Never accessed                                        │
│  [Revoke access]  [Send reminder]                        │
│                                                           │
│  [View Full Activity Dashboard →]                         │
└───────────────────────────────────────────────────────────┘
```

### 2. Permission model
- `viewer` — can read PDFs, cannot upload or edit
- `annotator` — can add notes and tags (stored in their own Box, not yours)
- `contributor` — can upload PDFs to the shared folder

### 3. `src/components/sharing/ActivityDashboard.jsx`
Full-page modal showing all access logs:
- Timeline of recent events: "[Sahand] viewed [FPP Mechanism Review] — 2h ago"
- Filter by folder, person, action type, date range
- Export activity log as CSV
- Visual summary: bar chart of accesses per person per week (simple CSS bars)

### 4. Access logging from collaborator side
When a collaborator opens a shared document:
```javascript
// Call this on every document open if user is accessing someone else's shared folder
workerClient.logAccess('view', docId, folderPath, userEmail)
```

### 5. Right-click context menu on folder in tree
```
[Share folder...]
[Copy sharing link]
[View who has access]
[Unshare all]
```

### 6. Right-click context menu on document card
```
[Edit metadata...]
[Move to folder...]      ← opens folder picker
[Duplicate]
[Mark as read / unread]
[Star / Unstar]
[Delete...]              ← with confirmation
```

Implement `MoveFolderPicker` — a small popover showing the folder tree, click to move doc.

### 7. "Never accessed" warning
In ShareModal, highlight collaborators who have never accessed the shared folder with an amber dot. Add "Send reminder" button (copies a message to clipboard: "Hi [name], I shared some papers with you on ScholarLib: [app URL]").

### 8. libraryStore updates
```javascript
moveDocument: (docId, targetFolderId) => {
  // Update library.json folder_id for doc
  // Move file in Box: adapter.moveFile(oldPath, newPath)
  // Save library.json
}
```

## Verification
- Share a folder via ShareModal
- Check Cloudflare KV via `wrangler kv:key list --namespace-id [SHARES_ID]`
- Revoke access — KV entry removed
- Activity dashboard shows logged events

## Commit
```bash
git commit -m "feat: sharing UI, activity dashboard, folder/doc context menus, move-to-folder"
```

---

# Stage 15 — Chat History Persistence + Export

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Persist AI chat history to Box (chat_history.json), build the chat history browser UI, and implement multi-format export.

## Claude Code Tasks

### 1. `src/services/ai/ChatHistoryService.js`
```javascript
class ChatHistoryService {
  async load(adapter) {
    return adapter.readJSON('_system/chat_history.json')
      .catch(() => ({ version: '1.0', conversations: [] }))
  }
  
  async save(adapter, history) {
    await adapter.writeJSON('_system/chat_history.json', history)
  }
  
  async addMessage(adapter, conversationId, message) {
    const history = await this.load(adapter)
    const conv = history.conversations.find(c => c.id === conversationId)
    if (conv) {
      conv.messages.push(message)
      conv.updated_at = new Date().toISOString()
    }
    await this.save(adapter, history)
  }
  
  async createConversation(adapter, scope, model, provider) {
    const history = await this.load(adapter)
    const conv = {
      id: `c_${nanoid()}`,
      title: 'New conversation',  // auto-titled after first AI response
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      scope, model, provider,
      messages: [],
      token_usage: { prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }
    }
    history.conversations.unshift(conv)
    await this.save(adapter, history)
    return conv
  }
  
  autoTitle(firstAIResponse) {
    // Take first 6 words of first AI response as title
    return firstAIResponse.split(' ').slice(0, 6).join(' ') + '...'
  }
}
```

### 2. Wire ChatPanel to history service
On every user message + AI response pair:
1. If no active conversation: `chatHistoryService.createConversation(...)`
2. After AI responds: `chatHistoryService.addMessage(...)` for both user + AI turns
3. Auto-title after first AI response

### 3. `src/components/ai/ChatHistoryModal.jsx` + `ChatHistoryModal.module.css`
Implement exactly per the v2 UI prototype:
- Search bar (filters by title, scope, date)
- Conversation list: title, date, scope, model, message count
- Per-conversation export button with format dropdown
- "Export all" button
- Clicking a conversation: loads it into ChatPanel (resume conversation)

### 4. `src/services/ai/ChatExporter.js`
```javascript
async exportAsMarkdown(conversation, library) {
  const lines = [
    `# ${conversation.title}`,
    `**Date:** ${formatDate(conversation.created_at)}`,
    `**Scope:** ${conversation.scope.description}`,
    `**Model:** ${conversation.model} (${conversation.provider})`,
    '',
    '---',
    '',
  ]
  for (const msg of conversation.messages) {
    lines.push(`## ${msg.role === 'user' ? 'You' : 'AI'}`)
    lines.push(msg.content)
    if (msg.citations?.length) {
      lines.push('')
      lines.push('*References: ' + msg.citations.map(c => c.citation).join(', ') + '*')
    }
    lines.push('')
  }
  return lines.join('\n')
}

async exportAsHTML(conversation, library) { /* similar, wrapped in HTML */ }
async exportAsPDF(conversation, library) { /* use jsPDF */ }
async exportAsJSON(conversation) { return JSON.stringify(conversation, null, 2) }

downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
```

### 5. "New chat" button
In ChatPanel, a "+" button starts a fresh conversation (previous one is saved to history).

### 6. Token usage display
After each AI exchange (cloud API only), append: `[2,400 tokens · ~$0.001]` in tiny text below AI message.

### 7. "Clear all history" in Settings
Wipes chat_history.json in Box. Show confirmation dialog.

## Verification
- Have a conversation
- Refresh page — conversation is restored in history
- Export as Markdown — file downloads with correct formatting
- Resume conversation from history — context is preserved

## Commit
```bash
git commit -m "feat: chat history persistence, ChatHistoryModal, multi-format export"
```

---

# Stage 16 — PWA Setup, Service Worker, Offline

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`

## Goal
Make the app installable as a PWA on Mac, Windows, and iPad. Implement a service worker that provides graceful offline degradation (app loads but shows offline notice, no data loss).

## Claude Code Tasks

### 1. Install Workbox
```bash
npm install -D vite-plugin-pwa workbox-window
```

### 2. Update `vite.config.js`
```javascript
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
          },
          {
            // Cache CrossRef API responses
            urlPattern: /^https:\/\/api\.crossref\.org\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'crossref-cache', expiration: { maxAgeSeconds: 86400 } }
          }
        ]
      },
      manifest: {
        name: 'ScholarLib',
        short_name: 'ScholarLib',
        description: 'Academic reference manager with AI-powered document Q&A',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'any',
        start_url: '/scholarlib/',
        scope: '/scholarlib/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      }
    })
  ]
})
```

### 3. Create app icons
Generate icons for `public/icons/`:
- `icon-192.png` — 192×192: gold "S" on dark background (`#0f1117`), rounded rect shape
- `icon-512.png` — 512×512: same design, larger
- `favicon.svg` — SVG version for browser tab

Use canvas in a Node script to generate these, or provide SVG and convert.

```javascript
// scripts/generate-icons.js
import { createCanvas } from 'canvas'
import fs from 'fs'

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  
  // Background
  ctx.fillStyle = '#0f1117'
  ctx.roundRect(0, 0, size, size, size * 0.22)
  ctx.fill()
  
  // Gold S
  ctx.fillStyle = '#d4af64'
  ctx.font = `bold ${size * 0.6}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('S', size / 2, size / 2)
  
  return canvas.toBuffer('image/png')
}

fs.writeFileSync('public/icons/icon-192.png', generateIcon(192))
fs.writeFileSync('public/icons/icon-512.png', generateIcon(512))
```

```bash
npm install -D canvas
node scripts/generate-icons.js
```

### 4. Offline state handling
In `src/App.jsx`, listen for online/offline events:
```javascript
const [isOnline, setIsOnline] = useState(navigator.onLine)
useEffect(() => {
  const handleOnline = () => setIsOnline(true)
  const handleOffline = () => setIsOnline(false)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
}, [])
```

When offline:
- Show a small amber banner at top: "⚠️ Offline — changes will sync when reconnected"
- Library data (last loaded) still visible (from memory)
- Upload and save buttons disabled
- AI chat disabled (unless WebLLM is loaded — it works offline)
- PDF viewer works for PDFs already loaded in memory

### 5. PWA install prompt
```javascript
// src/hooks/usePWAInstall.js
export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null)
  
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  
  const install = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }
  
  return { canInstall: !!installPrompt, install }
}
```

Show "Install App" button in sidebar footer when `canInstall` is true.

### 6. iOS Safari install instructions
Safari doesn't support `beforeinstallprompt`. Detect Safari on iPad/iPhone and show a tooltip:
"To install: tap Share → Add to Home Screen" with an arrow pointing to the Safari share button.

## Verification
- `npm run build && npm run preview`
- Chrome DevTools → Application → Service Workers — service worker registered
- Application → Manifest — manifest loaded correctly
- Chrome → install icon appears in address bar → install → app opens in standalone window
- Go offline in DevTools → app still loads, shows offline banner

## Commit
```bash
git commit -m "feat: PWA setup — installable on Mac/Windows/iPad, offline graceful degradation"
```

---

# Stage 17 — Polish, Error Handling, Accessibility, Final QA

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`
Also read individual component files as needed.

## Goal
Production-quality error handling across all services, loading states, accessibility improvements, light theme, responsive polish, and final quality review.

## Claude Code Tasks

### 1. Global error boundary
```jsx
// src/components/layout/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: 'Fraunces', fontSize: 24, color: 'var(--accent)' }}>ScholarLib</div>
          <div style={{ color: 'var(--text-tertiary)' }}>Something went wrong. Your data is safe in Box.</div>
          <button onClick={() => window.location.reload()}>Reload app</button>
        </div>
      )
    }
    return this.props.children
  }
}
```

### 2. Loading states — every async operation needs one
- Library loading: full-screen spinner with "Loading your library..."
- Document list loading: skeleton cards (animated placeholder)
- PDF loading: spinner in viewer area
- AI response: streaming (already done) + timeout handling (30s)
- Metadata extraction: progress steps shown in modal ("Checking CrossRef...", "Found!")

Skeleton component:
```css
.skeleton {
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

### 3. Error handling for all service calls
Wrap every `adapter.*` call:
```javascript
async function safeLoad(fn, fallback, toastOnError = false) {
  try {
    return await fn()
  } catch (e) {
    if (e.code === 'STORAGE_AUTH_EXPIRED') {
      storageStore.getState().promptReconnect()
    } else if (e.code === 'STORAGE_RATE_LIMIT') {
      await sleep(e.retryAfter || 5000)
      return safeLoad(fn, fallback)
    } else {
      if (toastOnError) showToast({ message: e.message, type: 'error' })
      return fallback
    }
  }
}
```

### 4. Accessibility
- All interactive elements have `aria-label` where label isn't visible
- Keyboard navigation: folder tree navigable with arrow keys
- Focus management: when modal opens, focus first input; when closes, return focus to trigger
- Color contrast: verify all text meets WCAG AA (4.5:1) — use browser DevTools
- `role="status"` on loading/AI status indicators
- Reduce motion: `@media (prefers-reduced-motion)` — disable animations

### 5. Light theme
Add to `tokens.css`:
```css
[data-theme="light"] {
  --bg-base:     #f5f4f0;
  --bg-sidebar:  #eceae4;
  --bg-surface:  #ffffff;
  --bg-elevated: #f0ede8;
  --bg-hover:    rgba(0,0,0,0.04);
  --bg-selected: rgba(212,175,100,0.12);
  --border-subtle:  rgba(0,0,0,0.06);
  --border-default: rgba(0,0,0,0.1);
  --text-primary:   #1a1c22;
  --text-secondary: #2d3040;
  --text-tertiary:  #5a6070;
  --text-muted:     #8a90a0;
  --text-faint:     #bbbfc8;
}
```

Apply via `document.documentElement.setAttribute('data-theme', theme)` from uiStore.

### 6. Responsive polish
- Test on iPad viewport (1024×768 and 820×1180)
- Ensure modals don't overflow on small screens
- DocList drawer animation on mobile
- Touch targets: minimum 44×44px for all interactive elements

### 7. Performance
- Memoize FolderTree and DocCard with React.memo
- Virtualize DocList if > 100 documents (use `react-virtual`)
- Lazy load WebLLM (dynamic import only when selected)
- PDF.js worker: ensure it's not blocking main thread

### 8. Final file: `src/utils/constants.js`
```javascript
export const APP_VERSION = '1.0.0'
export const LIBRARY_VERSION = '1.0'
export const EMBEDDING_VERSION = 'v1'
export const EMBEDDING_DIMS = 768
export const MAX_CHUNK_SIZE = 512
export const CHUNK_OVERLAP = 50
export const TOP_K_SEARCH = 12
export const OLLAMA_BASE_URL = 'http://localhost:11434'
export const CROSSREF_EMAIL = ''  // Set in Settings
export const MAX_PDF_SIZE_MB = 200
```

### 9. `CHANGELOG.md`
Create with v1.0.0 entry listing all features.

### 10. Update `README.md`
- Live demo link
- Feature list
- Setup instructions for new users
- How to contribute (link to CLAUDE.md for developers)

## Final verification checklist
- [ ] All 17 stages tested end-to-end
- [ ] Upload a PDF → metadata extracted → AI indexed → chat works
- [ ] Share a folder → collaborator can access → activity logged
- [ ] Notes save and export correctly
- [ ] Chat history persists across refresh
- [ ] PWA installs on Chrome
- [ ] Offline mode shows graceful degradation
- [ ] Settings all persist correctly
- [ ] No console errors in production build
- [ ] GitHub Pages deployment succeeds

## Final Commit
```bash
git add -A
git commit -m "feat: v1.0.0 — production polish, error handling, accessibility, light theme, PWA"
git tag v1.0.0
git push origin main --tags
```

🎉 ScholarLib v1.0.0 is live.
