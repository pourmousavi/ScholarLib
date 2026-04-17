# Stage 06 — Storage Abstraction: Box + Dropbox Adapters

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Implement the StorageAdapter interface with Box and Dropbox backends. Implement OAuth flows, token management, and library.json loading/saving. Connect real Box file access to the PDF viewer.

## Prerequisites
- Ali has created the Box Developer App and `.env.local` (see `docs/USER_SETUP.md` §2.1–2.3)

## Claude Code Tasks

### 1. Install dependencies
```bash
npm install axios
```

### 2. `src/services/storage/StorageAdapter.js`
Define the interface as JSDoc (not TypeScript — keeps things simple). Document all methods with return types.

### 3. `src/services/storage/BoxAdapter.js`
Implement full StorageAdapter interface for Box.

#### OAuth PKCE Flow:
```javascript
async connect() {
  const verifier = generateCodeVerifier()   // 128 random chars
  const challenge = await sha256Base64URL(verifier)
  sessionStorage.setItem('pkce_verifier', verifier)
  
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_BOX_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_BOX_REDIRECT_URI,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: generateState()
  })
  window.location.href = `https://account.box.com/api/oauth2/authorize?${params}`
}
```

#### Token exchange (handled in `/auth/box` route):
```javascript
async handleCallback(code) {
  const verifier = sessionStorage.getItem('pkce_verifier')
  const response = await fetch('https://api.box.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: import.meta.env.VITE_BOX_CLIENT_ID,
      code_verifier: verifier,
      redirect_uri: import.meta.env.VITE_BOX_REDIRECT_URI,
    })
  })
  const { access_token, refresh_token, expires_in } = await response.json()
  this._storeTokens(access_token, refresh_token, expires_in)
}
```

#### Token storage (encrypted in localStorage):
```javascript
_storeTokens(accessToken, refreshToken, expiresIn) {
  const expiry = Date.now() + (expiresIn * 1000)
  localStorage.setItem('sv_box_access', btoa(accessToken))  // simple obfuscation
  localStorage.setItem('sv_box_refresh', btoa(refreshToken))
  localStorage.setItem('sv_box_expiry', expiry.toString())
}
```

#### Silent token refresh:
```javascript
async refreshTokenIfNeeded() {
  const expiry = parseInt(localStorage.getItem('sv_box_expiry') || '0')
  if (Date.now() < expiry - 300000) return  // still valid (5 min buffer)
  
  const refreshToken = atob(localStorage.getItem('sv_box_refresh') || '')
  if (!refreshToken) throw { code: 'STORAGE_AUTH_EXPIRED' }
  
  // POST to box token endpoint with grant_type: refresh_token
  // Store new tokens
}
```

#### All file operations use Box Content API:
- Base URL: `https://api.box.com/2.0`
- Auth header: `Authorization: Bearer ${accessToken}`
- Rate limit: add exponential backoff on 429 responses

#### Find/create root folder:
On first connect, search for folder named `ScholarLib` in root. Create if not found. Cache folder ID in localStorage.

### 4. `src/services/storage/DropboxAdapter.js`
Implement same interface for Dropbox. Dropbox uses simpler OAuth 2 implicit flow (no PKCE needed for their SDK).

```bash
npm install dropbox
```

Dropbox API base: `https://api.dropboxapi.com/2/` and `https://content.dropboxapi.com/2/`

Key differences from Box:
- No WebDAV
- File paths instead of IDs (use paths throughout)
- `files/download` for file content
- `files/upload` for uploads (< 150MB) or sessions for larger

### 5. `src/services/storage/StorageFactory.js`
```javascript
export function createStorageAdapter(provider) {
  if (provider === 'box') return new BoxAdapter()
  if (provider === 'dropbox') return new DropboxAdapter()
  throw new Error(`Unknown provider: ${provider}`)
}
```

### 6. `src/store/storageStore.js`
Implement storageStore per `docs/ARCHITECTURE.md`. On app load, check localStorage for saved provider + tokens. Auto-connect if valid.

### 7. `src/services/library/LibraryService.js`
Handles library.json CRUD via the active StorageAdapter:

```javascript
async loadLibrary(adapter) {
  try {
    return await adapter.readJSON('_system/library.json')
  } catch (e) {
    if (e.code === 'STORAGE_NOT_FOUND') {
      return this.createEmptyLibrary()  // First run
    }
    throw e
  }
}

async saveLibrary(adapter, library) {
  library.last_modified = new Date().toISOString()
  await adapter.writeJSON('_system/library.json', library)
}
```

### 8. Auth callback route handling
In `src/App.jsx`, check if URL contains `/auth/box?code=` on mount. If so, call `boxAdapter.handleCallback(code)`, then redirect to `/`.

### 9. Storage setup screen `src/components/layout/StorageSetup.jsx`
Shown when no storage provider is connected. Full-screen:
- App logo + name
- "Choose your storage:" with Box and Dropbox options (radio style, per design system)
- Connect button (calls adapter.connect())
- Brief privacy note: "Your PDFs and data are stored entirely in your chosen cloud storage. ScholarLib servers only log sharing activity."

### 10. Wire PDF viewer to Box
In libraryStore, when selectedDoc changes, call `adapter.getFileStreamURL(doc.box_file_id)` and pass to `<PDFViewer url={...} />`.

Box streaming URL: `GET /2.0/files/{file_id}/content` — Box returns a redirect to a pre-signed S3 URL valid for 60 seconds.

## Verification
- Connect Box button redirects to Box OAuth
- After auth, redirects back and loads library.json (creates it if first run)
- Storage setup screen shows when no provider connected
- Uploading a PDF manually to Box and refreshing shows it (in Stage 07 we automate this)

## Commit
```bash
git commit -m "feat: Box and Dropbox storage adapters, OAuth PKCE flow, library.json service"
```

---

# Stage 07 — Metadata Extraction Pipeline + Review Modal

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Implement the complete metadata extraction pipeline and the MetadataModal UI for user review before saving.

## Claude Code Tasks

### 1. `src/services/metadata/MetadataExtractor.js`
Orchestrates the 4-step pipeline per `docs/ARCHITECTURE.md` Metadata Extraction section.

```javascript
async extractMetadata(pdfText, filename) {
  // Step 1: Parse PDF embedded metadata (from PDF.js getMetadata())
  let result = this.parseEmbeddedMetadata(pdfText.metadata)
  
  // Step 2: Try DOI lookup
  const doi = this.detectDOI(pdfText.firstPages)
  if (doi) {
    const crossref = await this.lookupCrossRef(doi)
    if (crossref) return { ...result, ...crossref, extraction_source: 'crossref' }
  }
  
  // Step 3: Try Semantic Scholar
  const ss = await this.lookupSemanticScholar(result.title || filename)
  if (ss && ss.confidence > 0.7) return { ...result, ...ss, extraction_source: 'semantic_scholar' }
  
  // Step 4: AI extraction (returns { metadata, confidence })
  return await this.extractWithAI(pdfText.firstPages)
}
```

### 2. `src/services/metadata/CrossRefService.js`
```javascript
async lookup(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ScholarLib/1.0 (mailto:your-email@adelaide.edu.au)' }
  })
  const data = await res.json()
  return this.normalizeWork(data.message)
}

normalizeWork(work) {
  return {
    title: work.title?.[0],
    authors: work.author?.map(a => ({ last: a.family, first: a.given })) ?? [],
    year: work['published-print']?.['date-parts']?.[0]?.[0],
    journal: work['container-title']?.[0],
    volume: work.volume,
    issue: work.issue,
    pages: work.page,
    doi: work.DOI,
    abstract: work.abstract,
    type: work.type,
    confidence: { title: 99, authors: 97, journal: 99, doi: 100, year: 99 }
  }
}
```

⚠️ CrossRef Polite Pool: Always include User-Agent with contact email to get higher rate limits.

### 3. `src/services/metadata/SemanticScholarService.js`
```javascript
async search(title) {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?` +
    `query=${encodeURIComponent(title)}&` +
    `fields=title,authors,year,venue,externalIds,abstract`
  const res = await fetch(url)
  const data = await res.json()
  return data.data?.[0] ? this.normalize(data.data[0]) : null
}
```

### 4. `src/services/metadata/AIExtractor.js`
```javascript
async extract(firstPagesText, aiService) {
  const prompt = `Extract bibliographic metadata from this academic paper excerpt.
Return ONLY a JSON object with these fields:
{ "title", "authors": [{"last","first"}], "year", "journal", "volume", "pages", "doi", "abstract" (2 sentences max), "tags": [3-5 keywords], "confidence": {"title","authors","journal","doi","year"} }

Paper text:
${firstPagesText.slice(0, 3000)}`

  const response = await aiService.complete(prompt)
  return this.parseJSON(response)
}
```

### 5. `src/components/metadata/MetadataModal.jsx` + `MetadataModal.module.css`
Implement EXACTLY as shown in the prototype (Stage 07 of the UI mockup), including:
- Confidence bars per field (using ConfBar component)
- Source indicator (CrossRef / Semantic Scholar / AI / Manual)
- "Re-extract with AI" button (re-runs Step 4 of pipeline)
- All fields editable (title, authors, year, journal, volume, pages, DOI, abstract)
- Authors as free-text field (comma-separated "Last F." format) — parsed to array on save
- Tags field with add/remove (Tag component + input)
- High confidence summary notice (green) or warning (amber if any field < 70%)
- Cancel / Save to Library buttons

### 6. `src/components/metadata/UploadZone.jsx`
Drag-and-drop zone for PDF upload. Shown at top of DocList or via ⊕ Add button.

```
On file drop:
1. Validate: PDF only, < 200MB
2. Show upload progress (reading file)
3. Extract text via PDF.js
4. Run MetadataExtractor pipeline
5. Open MetadataModal with results
6. On Save: upload PDF to Box, add DocumentRecord to library.json, close modal
```

### 7. Wire everything
- ⊕ Add button in sidebar and DocList header opens UploadZone or file picker
- On Save in MetadataModal: `libraryService.addDocument(doc)`, `adapter.uploadFile(...)`
- Show Toast on success: "✓ Paper added to Degradation"

### 8. Extend libraryStore
Add `addDocument(doc)`, `updateDocumentMetadata(id, metadata)`.

## Verification
- Upload a PDF
- Metadata modal opens with extracted data
- CrossRef lookup works for a paper with a DOI
- Fields are editable
- Save adds the doc to the list

## Commit
```bash
git commit -m "feat: metadata extraction pipeline (CrossRef, SemanticScholar, AI) + review modal"
```

---

# Stage 08 — Notes Panel + Export

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Implement the Notes panel with markdown-aware editor, tags, auto-save, and multi-format export.

## Claude Code Tasks

### 1. Install
```bash
npm install jspdf
```

### 2. `src/services/notes/NotesService.js`
- `loadNotes(adapter)` — reads `_system/notes.json`
- `saveNote(adapter, docId, noteData)` — writes back
- `getNoteForDoc(docId)` — returns note or empty note object
- Auto-save: debounce 1.5 seconds after last keystroke

### 3. `src/components/notes/NotesPanel.jsx` + `NotesPanel.module.css`
Per `docs/DESIGN_SYSTEM.md` AI Chat Panel / Notes section and the UI prototype:
- Panel header: "Personal notes" + subtitle + action buttons
- Textarea editor (not a rich text editor — plain markdown, renders as-is)
- Tags row with add/remove
- AI assistance strip at bottom: [Summarise] [Key equations] [Related papers] buttons

Export button opens dropdown with:
- Markdown (.md) — direct text download
- Plain text (.txt) — same as md
- PDF — use jsPDF, render note text in clean layout
- DOCX — generate simple Word doc (single section, styled body text)
- Copy to clipboard

### 4. `src/services/notes/NoteExporter.js`
```javascript
async exportAsMarkdown(note, docTitle) {
  const header = `# Notes: ${docTitle}\n\n`
  return header + note.content
}

async exportAsPDF(note, docTitle) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text(docTitle, 20, 20)
  doc.setFontSize(11)
  const lines = doc.splitTextToSize(note.content, 170)
  doc.text(lines, 20, 35)
  return doc.output('blob')
}
```

### 5. Auto-save indicator
Small text in panel header: "Saved 2 min ago" / "Saving..." / "Save failed — retry". Updates every 30 seconds while note is open.

### 6. Wire notes to libraryStore
When selectedDocId changes, load note from NotesService. When leaving panel or closing doc, ensure save is triggered.

## Verification
- Notes persist across browser refresh (stored in Box)
- Export to Markdown downloads a correctly formatted file
- Tags add/remove correctly
- Auto-save fires without page lag

## Commit
```bash
git commit -m "feat: notes panel with auto-save, tags, and multi-format export"
```

---

# Stage 09 — AI Chat: Ollama + WebLLM (Local)

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`

## Goal
Implement the AI chat panel with local Ollama support and WebLLM browser-based fallback. No cloud API yet (Stage 10). Scope selector (this doc / folder / all library). Chat history saving.

## Claude Code Tasks

### 1. Install
```bash
npm install @mlc-ai/web-llm
```

### 2. `src/store/aiStore.js`
Implement per `docs/ARCHITECTURE.md` State Management section.

### 3. `src/services/ai/OllamaService.js`
```javascript
class OllamaService {
  constructor() {
    this.baseURL = 'http://localhost:11434'
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch { return false }
  }

  // Popular models: llama3.2, llama3.2:1b, llama3.1:8b, mistral, gemma3:4b, gemma3:12b

  async *streamChat(messages, model = 'llama3.2') {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true })
    })
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        const data = JSON.parse(line)
        if (data.message?.content) yield data.message.content
      }
    }
  }

  async embed(text, model = 'nomic-embed-text') {
    const res = await fetch(`${this.baseURL}/api/embeddings`, {
      method: 'POST',
      body: JSON.stringify({ model, prompt: text })
    })
    const data = await res.json()
    return data.embedding  // Float64Array
  }
}
```

### 4. `src/services/ai/WebLLMService.js`
```javascript
import * as webllm from '@mlc-ai/web-llm'

class WebLLMService {
  constructor() {
    this.engine = null
    this.loadingProgress = 0
  }

  async initialize(model = 'Llama-3.2-3B-Instruct-q4f32_1-MLC', onProgress) {
    this.engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (report) => {
        this.loadingProgress = report.progress
        onProgress?.(report)
      }
    })
  }

  async *streamChat(messages) {
    const reply = await this.engine.chat.completions.create({
      messages,
      stream: true,
    })
    for await (const chunk of reply) {
      yield chunk.choices[0]?.delta?.content ?? ''
    }
  }

  isReady() { return this.engine !== null }
}
```

WebLLM model download UX: Show a progress modal with download progress bar and size indicator ("Downloading AI model to browser — 2.1 GB / 3.9 GB"). Only shown on first use per browser.

### 5. `src/services/ai/AIService.js`
Provider-agnostic router:
```javascript
async *streamChat(messages) {
  const provider = aiStore.getState().provider
  if (provider === 'ollama') yield* ollamaService.streamChat(messages)
  else if (provider === 'webllm') yield* webllmService.streamChat(messages)
  else if (provider === 'claude') yield* claudeService.streamChat(messages)  // Stage 10
  else if (provider === 'openai') yield* openaiService.streamChat(messages)  // Stage 10
  else throw { code: 'AI_NOT_CONFIGURED' }
}
```

### 6. `src/components/ai/ChatPanel.jsx` + `ChatPanel.module.css`
Implement per design spec and UI prototype:
- Scope selector (updates which doc chunks are searched)
- Message list (auto-scroll on new message)
- AI avatar (✦) + user avatar (initial)
- Streaming response (text appears token by token)
- Thinking animation (3 dots pulse) while waiting for first token
- Quick prompt chips below input
- "History" button opens ChatHistoryModal (Stage 15)
- Model status indicator (top right)
- Error state: "AI not configured — [Configure →]" link to Settings

### 7. `src/components/ai/ScopeSelector.jsx`
Three buttons: This document | This folder (N) | All library (N)
Updates chatStore.scope. Scope affects which chunks are retrieved in Stage 11.

### 8. AI status check on app load
`aiStore` checks Ollama availability on startup: `GET localhost:11434/api/tags`. Updates sidebar AI status dot (green if available, grey if not).

### 9. WebLLM model download prompt
When user selects WebLLM in Settings (Stage 12) or on first AI query with WebLLM selected, show download prompt:
```
"Download AI model to this browser?
 Llama 3.2 3B — approximately 2.1 GB
 Downloaded once, stored in browser cache permanently.
 [Download & Enable] [Cancel]"
```

### 10. System prompt construction
```javascript
buildSystemPrompt(scope, retrievedChunks) {
  return `You are ScholarLib AI, an academic research assistant.
The user is reviewing ${scope.description}.
${retrievedChunks.length} relevant excerpts from ${scope.docCount} documents have been retrieved.

Retrieved context:
${retrievedChunks.map(c => `[${c.citation}]\n${c.text}`).join('\n\n')}

Rules:
- Answer based on the retrieved context
- Cite sources as [Author Year] inline
- If the answer isn't in the context, say so
- Be concise and academically precise`
}
```

Note: In Stage 09, retrievedChunks will be empty (indexing not yet built). AI answers from its own knowledge for now. Full RAG is wired in Stage 11.

## Verification
- Ollama must be running: `ollama serve`
- Ask a question in AI chat — response streams token by token
- Scope selector switches between scope options
- Error message shows when Ollama not running

## Commit
```bash
git commit -m "feat: AI chat panel with Ollama streaming and WebLLM browser inference"
```

---

# Stage 10 — AI Chat: Claude + OpenAI + Gemini Cloud Fallback

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`
Also read: `src/services/ai/AIService.js` (from Stage 09)

## Goal
Add Claude API, OpenAI API, and Gemini API as cloud AI providers. Implement token cost estimation. Seamless switching between providers.

## Claude Code Tasks

### 1. `src/services/ai/ClaudeService.js`
```javascript
class ClaudeService {
  constructor() {
    this.baseURL = 'https://api.anthropic.com/v1'
  }

  getApiKey() {
    return localStorage.getItem('sv_claude_key') || ''
  }

  async *streamChat(messages, model = 'claude-haiku-4-5-20251001') {
    const apiKey = this.getApiKey()
    if (!apiKey) throw { code: 'AI_NOT_CONFIGURED', message: 'Claude API key not set' }

    // Separate system messages from user/assistant
    const system = messages.find(m => m.role === 'system')?.content || ''
    const chatMessages = messages.filter(m => m.role !== 'system')

    const res = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: chatMessages,
        stream: true,
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw { code: 'AI_REQUEST_FAILED', message: err.error?.message }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = JSON.parse(line.slice(6))
        if (data.type === 'content_block_delta') {
          yield data.delta.text
        }
      }
    }
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4)  // rough estimate
  }

  estimateCost(promptTokens, completionTokens, model) {
    const pricing = {
      'claude-haiku-4-5-20251001': { input: 0.00000025, output: 0.00000125 },
      'claude-sonnet-4-6':         { input: 0.000003,   output: 0.000015 },
    }
    const p = pricing[model] || pricing['claude-haiku-4-5-20251001']
    return (promptTokens * p.input) + (completionTokens * p.output)
  }
}
```

⚠️ API keys stored ONLY in localStorage. Never sent to Cloudflare Worker or written to Box.

### 2. `src/services/ai/OpenAIService.js`
```javascript
class OpenAIService {
  getApiKey() { return localStorage.getItem('sv_openai_key') || '' }

  async *streamChat(messages, model = 'gpt-4o-mini') {
    const apiKey = this.getApiKey()
    if (!apiKey) throw { code: 'AI_NOT_CONFIGURED' }
    
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, stream: true })
    })
    // Parse SSE stream same pattern as Claude
  }
}
```

### 3. `src/services/ai/GeminiService.js`
```javascript
class GeminiService {
  getApiKey() { return localStorage.getItem('sv_gemini_key') || '' }

  // Convert ScholarLib messages to Gemini format:
  // {role: 'user'|'assistant', content} → {role: 'user'|'model', parts: [{text}]}
  // System messages → separate systemInstruction field
  _convertMessages(messages) { /* ... */ }

  async *streamChat(messages, model = 'gemini-2.0-flash') {
    const apiKey = this.getApiKey()
    if (!apiKey) throw { code: 'AI_NOT_CONFIGURED' }

    const { systemInstruction, contents } = this._convertMessages(messages)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction }) }
    )
    // Parse SSE: data.candidates[0].content.parts[0].text
  }
}
```

Available models: `gemini-2.0-flash` (free tier), `gemini-2.5-flash`, `gemini-2.5-pro`.
Gemini has a generous free tier (1500 RPD for Flash models), making it ideal for mobile/tablet users.

### 4. Cost estimation in ChatPanel
Before sending a query when using cloud APIs, show estimated cost:
```
"This query will use approximately 3,200 tokens (~$0.001 with Claude Haiku)"
[Send anyway] [Cancel]
```
This is a non-blocking hint — users can disable it in Settings.

### 4. Per-query model override
In chat input area, small model selector dropdown (only visible when using cloud API):
`[claude-haiku ▾]` — allows switching to Sonnet for complex questions.

### 5. Token usage tracking in chat history
After each AI response, store token usage in the conversation record (Stage 15 persists this to Box).

### 6. Update AIService.js
Wire new services into the provider router from Stage 09.

## Verification
- Enter Claude API key in Settings (Stage 12 not built yet — temporarily hard-code in AIService for testing, remove before commit)
- AI chat works via Claude API with streaming
- Enter Gemini API key — chat works with streaming via Gemini 2.0 Flash
- Cost estimate shows before sending
- Provider switching between Claude, OpenAI, and Gemini works seamlessly

## Commit
```bash
git commit -m "feat: Claude, OpenAI, and Gemini API streaming with cost estimation"
```

---

# Stage 11 — AI Indexing Pipeline + Vector Search

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/LIBRARY_SCHEMA.md`
Also read: `src/services/ai/OllamaService.js`, `src/services/ai/ClaudeService.js`

## Goal
Implement the complete RAG pipeline: PDF text chunking, embedding generation, binary index storage in Box, and in-browser vector search. Connect everything to the chat panel scope selector.

## Claude Code Tasks

### 1. Install
```bash
npm install usearch
```

### 2. `src/services/indexing/TextChunker.js`
```javascript
class TextChunker {
  chunk(text, { chunkSize = 512, overlap = 50 } = {}) {
    const words = text.split(/\s+/)
    const chunks = []
    let i = 0
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ')
      chunks.push(chunk)
      i += chunkSize - overlap
    }
    return chunks
  }

  async extractTextFromPDF(pdfURL, pdfjsLib) {
    const pdf = await pdfjsLib.getDocument(pdfURL).promise
    const textParts = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      textParts.push(content.items.map(item => item.str).join(' '))
    }
    return textParts.join('\n')
  }
}
```

### 3. `src/services/indexing/EmbeddingService.js`
Routes embedding generation to the correct model based on current AI provider:

```javascript
async embed(text) {
  const provider = aiStore.getState().provider
  if (provider === 'ollama') {
    return await ollamaService.embed(text, 'nomic-embed-text')  // 768 dims
  } else if (provider === 'webllm') {
    // WebLLM doesn't support embedding natively yet
    // Fallback: use a tiny local embedding via transformers.js
    return await this.embedWithTransformersJS(text)
  } else if (provider === 'claude' || provider === 'openai') {
    return await this.embedWithAPI(text, provider)
  }
}

async embedWithTransformersJS(text) {
  // Load on demand (lazy import)
  const { pipeline } = await import('@xenova/transformers')
  const embedder = await pipeline('feature-extraction', 'Xenova/nomic-embed-text-v1')
  const output = await embedder(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}
```

Install if WebLLM embedding fallback needed: `npm install @xenova/transformers`

### 4. `src/services/indexing/IndexService.js`
Core indexing logic:

```javascript
class IndexService {
  async indexDocument(docId, pdfURL, adapter) {
    // 1. Extract text
    const text = await textChunker.extractTextFromPDF(pdfURL, pdfjsLib)
    const chunks = textChunker.chunk(text)
    
    // 2. Generate embeddings (batch, with progress updates)
    const embeddings = []
    for (let i = 0; i < chunks.length; i++) {
      const emb = await embeddingService.embed(chunks[i])
      embeddings.push(emb)
      this.onProgress?.({ docId, current: i + 1, total: chunks.length })
    }
    
    // 3. Load existing index from Box (or create new)
    const { indexData, meta } = await this.loadIndex(adapter)
    
    // 4. Add new document chunks
    const offset = meta.total_chunks
    indexData.push(...embeddings)  // append Float32 vectors
    meta.docs[docId] = { chunk_count: chunks.length, chunk_offset: offset, indexed_at: new Date().toISOString() }
    meta.total_chunks += chunks.length
    
    // 5. Store chunk text metadata
    const chunksMeta = await adapter.readJSON('_system/index/chunks_meta.json').catch(() => ({ chunks: [] }))
    chunks.forEach((text, i) => {
      chunksMeta.chunks[offset + i] = { doc_id: docId, chunk_index: i, text_preview: text.slice(0, 100) }
    })
    
    // 6. Save to Box
    const binary = new Float32Array(indexData.flat()).buffer
    await adapter.uploadFile('_system/index/embeddings_v1.bin', new Blob([binary]))
    await adapter.writeJSON('_system/index/index_meta.json', meta)
    await adapter.writeJSON('_system/index/chunks_meta.json', chunksMeta)
    
    // 7. Update library.json doc status
    await libraryService.updateDocIndexStatus(docId, 'indexed', adapter)
  }

  async loadIndex(adapter) {
    try {
      const binary = await adapter.downloadFile('_system/index/embeddings_v1.bin')
      const meta = await adapter.readJSON('_system/index/index_meta.json')
      const arr = new Float32Array(await binary.arrayBuffer())
      const vectors = []
      const dims = meta.embedding_dimensions  // 768
      for (let i = 0; i < arr.length; i += dims) {
        vectors.push(Array.from(arr.slice(i, i + dims)))
      }
      return { indexData: vectors, meta }
    } catch {
      return { indexData: [], meta: this.createEmptyMeta() }
    }
  }

  async search(query, scope, adapter, topK = 12) {
    const queryEmbedding = await embeddingService.embed(query)
    const { indexData, meta } = await this.loadIndex(adapter)  // cached in memory
    
    // Filter by scope
    const relevantOffsets = this.getScopeOffsets(scope, meta)
    
    // Cosine similarity search
    const results = relevantOffsets
      .map(i => ({ index: i, score: cosineSimilarity(queryEmbedding, indexData[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
    
    // Load chunk text for top results
    const chunksMeta = await adapter.readJSON('_system/index/chunks_meta.json')
    return results.map(r => ({
      ...chunksMeta.chunks[r.index],
      score: r.score,
      citation: this.buildCitation(r.index, meta, libraryStore)
    }))
  }
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}
```

### 5. `src/store/indexStore.js`
Implement per `docs/ARCHITECTURE.md`. On app load, check which docs in current library have status ≠ 'indexed', populate `pendingDocs`. Cache loaded embeddings in memory (avoid re-downloading on every query).

### 6. Background indexing
When AI is available and pendingDocs.length > 0, auto-index in background with low priority (requestIdleCallback or setTimeout). Show progress in sidebar footer: "Indexing 3/18 papers..."

### 7. Wire RAG into ChatPanel
In ChatPanel, before sending to AI:
1. `indexService.search(userMessage, scope, adapter)` → retrivedChunks
2. Build system prompt with chunks
3. Stream to AI

Citations in AI response: parse `[Author Year]` patterns, make clickable to jump to that doc.

### 8. "Index now" button
In PendingNotice and MetadataModal, wire "Index now →" to `indexStore.indexDocument(docId)`. Show progress per doc.

## Verification
- Upload a paper and let it index (watch status dot change green)
- Ask a question in AI chat scoped to that paper
- AI response cites the paper content (not just hallucinating)

## Commit
```bash
git commit -m "feat: RAG pipeline — PDF chunking, embeddings, vector search, citations"
```
