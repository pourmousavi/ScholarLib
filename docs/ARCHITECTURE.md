# ScholarLib — Architecture

> Load this file when working on Stages 05, 06, 07, 11, 13, 14.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                          │
│                                                                 │
│  UI Layer          State Layer         Service Layer            │
│  ─────────         ───────────         ─────────────            │
│  Components    →   Zustand Store   →   Storage Service          │
│  (React)           (global state)      (Box / Dropbox API)      │
│                                                                 │
│                                        Metadata Service         │
│                                        (CrossRef / AI)          │
│                                                                 │
│                                        AI Service               │
│                                        (Ollama/WebLLM/API)      │
│                                                                 │
│                                        Index Service            │
│                                        (embeddings/vector)      │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
          ┌──────────────┼──────────────────────┐
          │              │                      │
          ▼              ▼                      ▼
   Box / Dropbox   Cloudflare Worker      CrossRef API
   (PDF storage,   (access logging,       Semantic Scholar
    library.json,   sharing tokens,       AI APIs (optional)
    index files,    activity feed)        Ollama localhost
    notes, chats)
```

---

## Data Storage Model

Everything user-owned lives in Box (or Dropbox). The only server is the Cloudflare Worker, which stores access logs only — never document content.

### Box folder structure

```
/ScholarLib/                          ← root app folder
  _system/
    library.json                        ← complete library index (see LIBRARY_SCHEMA.md)
    settings.json                       ← user preferences
    chat_history.json                   ← all AI conversations
    notes.json                          ← all notes keyed by doc ID
    index/
      embeddings_v1.bin                 ← vector embeddings (all docs)
      index_meta.json                   ← which docs are indexed, version, model
  PDFs/
    [folder-slug]/
      [subfolder-slug]/
        paper-title-hash.pdf
  Shared/                               ← Box-native shared folder (read-only to collaborators)
    [subfolder mirrors]
```

### library.json — top-level shape

See `docs/LIBRARY_SCHEMA.md` for full spec. Key top-level fields:

```json
{
  "version": "1.0",
  "last_modified": "ISO8601",
  "folders": [ /* FolderNode tree */ ],
  "documents": { "doc-id": { /* DocumentRecord */ } }
}
```

---

## Authentication Flows

### Box OAuth 2.0 (PKCE)

```
User clicks "Connect Box"
  → App generates code_verifier + code_challenge (PKCE)
  → Redirect to Box authorize URL
  → Box redirects back to /auth/box?code=...
  → App exchanges code for access_token + refresh_token
  → Tokens stored in localStorage (encrypted with device key)
  → App fetches /scholarlib/_system/library.json to confirm access
```

Box tokens expire in 60 minutes. The app silently refreshes using the refresh_token (valid 60 days). If refresh fails, user is prompted to reconnect.

### Cloudflare Worker Auth

The Worker issues short-lived signed tokens (JWT, 1 hour) that grant read access to specific Box folder paths. This is how collaborators access shared content through the app without getting full Box access.

```
Collaborator opens app
  → App POSTs to Worker: { email, folder_path }
  → Worker checks access list in KV: { folder_path: [allowed_emails] }
  → If allowed: Worker returns signed JWT + Box read-only token for that path
  → App uses token to read files from Box
  → Worker logs: { email, folder_path, doc_id, timestamp }
```

---

## AI Architecture

### Indexing Pipeline (runs on capable devices)

```
PDF added to library
  ↓
1. PDF.js extracts full text (browser WASM)
  ↓
2. Text split into 512-token chunks with 50-token overlap
   Metadata attached: { doc_id, folder_path, chunk_index, page_approx }
  ↓
3. Each chunk → embedding model:
   a. Ollama: POST localhost:11434/api/embeddings
      { model: "nomic-embed-text", prompt: chunk }
   b. Cloud: POST api.anthropic.com or api.openai.com
  ↓
4. Embeddings stored as Float32Array binary blob
   → Uploaded to Box: /ScholarLib/_system/index/embeddings_v1.bin
   → index_meta.json updated with doc status = "indexed"
  ↓
5. UI reflects: StatusDot turns green
```

### Query Pipeline (runs on all devices)

```
User submits query (text)
  ↓
1. Download embeddings_v1.bin from Box (cached in memory)
  ↓
2. Embed query using same model (Ollama / WebLLM / API)
  ↓
3. Cosine similarity search via usearch WASM
   Filter by scope: { this_doc | this_folder | all }
   Return top-K chunks (default K=12)
  ↓
4. Build prompt:
   [System: academic assistant, scope context]
   [Retrieved chunks with citations]
   [User question]
  ↓
5. Send to LLM (Ollama / WebLLM / Claude / OpenAI)
  ↓
6. Stream response to chat UI
   Citations rendered as [Author Year] links
```

### AI Provider Priority (per device, set in Settings)

```
if (ollama_reachable) → use Ollama
else if (webllm_loaded) → use WebLLM  
else if (api_key_set) → use cloud API
else → show "AI not configured" prompt
```

---

## Cloudflare Worker API

Base URL: `https://scholarlib-api.[subdomain].workers.dev`

All endpoints require `Authorization: Bearer <app-token>` header where app-token is generated during Box OAuth.

### Endpoints

```
POST /share
  Body: { folder_path, collaborator_email, permission, expires_at? }
  → Creates access record in KV
  → Sends invitation email via Resend (optional)
  → Returns: { share_id }

DELETE /share/:share_id
  → Removes access record from KV

GET /access/:folder_path
  → Returns: { collaborators: [{ email, permission, last_accessed, doc_count }] }

POST /log
  Body: { action, doc_id, folder_path, collaborator_email }
  → Appends to KV access log
  → Returns: 200 OK

GET /activity/:folder_path
  Query: ?since=ISO8601&limit=50
  → Returns: { events: [{ email, action, doc_id, timestamp }] }

POST /token
  Body: { email, folder_path }
  → Validates access in KV
  → Returns: { box_token, expires_at } (short-lived read-only Box token)
```

### KV Namespaces

```
SHARES:   key=share_id  value={ folder_path, email, permission, expires_at }
ACCESS:   key=email:folder_path  value={ granted_at, permission }
LOGS:     key=folder_path:timestamp  value={ action, doc_id, email }
```

---

## Metadata Extraction Pipeline

For each uploaded PDF, attempt in order, stop when confident:

```
1. PDF embedded XMP/Dublin Core metadata
   → title, authors, doi, year (often empty or wrong)
   confidence: variable

2. DOI detection
   → Regex scan first 2 pages for DOI pattern
   → GET https://api.crossref.org/works/{doi}
   → Returns: title, authors, journal, year, volume, pages, abstract, citations
   confidence: 95-99% if DOI found

3. Title-based lookup (if no DOI or CrossRef fails)
   → GET https://api.semanticscholar.org/graph/v1/paper/search?query={title}
   → Returns: similar fields to CrossRef
   confidence: 70-90%

4. AI full-text extraction (last resort or user-triggered)
   → PDF.js extracts first 3 pages text
   → Prompt: "Extract: title, authors (Last F.), year, journal, volume, pages, DOI, abstract (2 sentences). Return JSON only."
   → Parse JSON response
   → Also generates: suggested_tags[], research_area, one_line_summary
   confidence: shown to user as "AI estimated"
```

All extracted fields shown in the MetadataModal with per-field confidence bars before saving.

---

## State Management (Zustand)

### Stores

```javascript
// libraryStore — document and folder data
{
  folders: FolderNode[],
  documents: Record<string, DocumentRecord>,
  selectedFolderId: string | null,
  selectedDocId: string | null,
  loadLibrary: () => Promise<void>,
  saveLibrary: () => Promise<void>,
  addDocument: (doc) => void,
  updateDocument: (id, patch) => void,
  moveDocument: (docId, targetFolderId) => void,
}

// storageStore — active storage backend
{
  provider: 'box' | 'dropbox' | null,
  isAuthenticated: boolean,
  storageAdapter: StorageAdapter | null,
  connect: (provider) => Promise<void>,
  disconnect: () => void,
}

// aiStore — AI configuration per device
{
  provider: 'ollama' | 'webllm' | 'claude' | 'openai' | 'none',
  ollamaStatus: 'connected' | 'disconnected' | 'checking',
  webllmStatus: 'idle' | 'loading' | 'ready',
  activeModel: string,
  setProvider: (provider) => void,
}

// uiStore — transient UI state
{
  activePanel: 'pdf' | 'ai' | 'notes' | 'metadata',
  showModal: string | null,   // 'metadata' | 'settings' | 'share' | 'chat-history'
  sidebarWidth: number,
  theme: 'dark' | 'light',
}

// indexStore — embedding index state
{
  indexedDocs: Set<string>,
  pendingDocs: string[],
  isIndexing: boolean,
  indexingProgress: number,
  checkIndexStatus: () => Promise<void>,
  indexDocument: (docId) => Promise<void>,
  indexPendingDocs: () => Promise<void>,
}
```

---

## Storage Adapter Interface

All storage backends implement this interface:

```typescript
interface StorageAdapter {
  // Auth
  connect(): Promise<void>
  disconnect(): void
  isAuthenticated(): boolean
  refreshTokenIfNeeded(): Promise<void>

  // Files
  uploadFile(path: string, blob: Blob, metadata?: object): Promise<{ id: string, url: string }>
  downloadFile(path: string): Promise<Blob>
  deleteFile(path: string): Promise<void>
  listFiles(folderPath: string): Promise<FileInfo[]>
  moveFile(fromPath: string, toPath: string): Promise<void>
  fileExists(path: string): Promise<boolean>

  // JSON helpers (serialize/deserialize automatically)
  readJSON(path: string): Promise<object>
  writeJSON(path: string, data: object): Promise<void>

  // Sharing (Box-specific features gracefully degrade on Dropbox)
  shareFolder(path: string, email: string, permission: 'viewer' | 'editor'): Promise<void>
  unshareFolder(path: string, email: string): Promise<void>
  getSharedUsers(path: string): Promise<SharedUser[]>
}
```

---

## Error Handling Strategy

All service calls wrapped in a standardised `Result<T, AppError>` pattern:

```typescript
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

type AppError =
  | { code: 'STORAGE_AUTH_EXPIRED'; message: string }
  | { code: 'STORAGE_RATE_LIMIT'; retryAfter: number }
  | { code: 'STORAGE_NOT_FOUND'; path: string }
  | { code: 'AI_NOT_CONFIGURED'; message: string }
  | { code: 'AI_TIMEOUT'; provider: string }
  | { code: 'METADATA_EXTRACTION_FAILED'; doc_id: string }
  | { code: 'INDEX_CORRUPTED'; message: string }
  | { code: 'NETWORK_OFFLINE'; message: string }
```

Errors shown in a non-blocking toast system. Retry logic for rate limits (exponential backoff). Auth errors trigger reconnect flow.
