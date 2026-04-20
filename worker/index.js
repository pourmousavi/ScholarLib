/**
 * ScholarLib Cloudflare Worker
 *
 * Handles:
 * - Folder sharing management
 * - Access control and validation
 * - Activity logging for collaborators
 * - Reference creation (for LitOrbit integration)
 *
 * KV Namespaces:
 * - SHARES: Share records (shareId -> share data)
 * - ACCESS: Access lookup (encodedFolderPath|encodedEmail -> access data)
 * - LOGS: Activity logs with 90-day TTL (encodedFolderPath|encodedEmail|timestamp)
 * - AUTH_CACHE: Short-lived Box token verification cache (SHA-256 hash -> user info, 5 min TTL)
 */

const BOX_API_BASE = 'https://api.box.com/2.0'
const BOX_UPLOAD_BASE = 'https://upload.box.com/api/2.0'

/**
 * Build a JSON Response with proper status and CORS headers.
 * @param {object} body
 * @param {number} status
 * @param {Record<string,string>} corsHeaders
 */
function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/**
 * Build an ACCESS or LOGS key from parts using URL-encoded components
 * joined by '|' (which cannot appear in encodeURIComponent output).
 */
function makeKey(...parts) {
  return parts.map(p => encodeURIComponent(p)).join('|')
}

/**
 * Parse a '|'-delimited key back into its raw parts.
 */
function parseKey(key) {
  return key.split('|').map(p => decodeURIComponent(p))
}

export default {
  async fetch(request, env) {
    // CORS handling
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim())

    // Allow requests without origin (non-browser traffic) — no CORS header needed
    const isAllowedOrigin = !origin || allowedOrigins.includes(origin)

    if (!isAllowedOrigin) {
      return jsonResponse({ error: 'Forbidden' }, 403, {})
    }

    // Only set CORS headers when a valid browser origin is present
    const corsHeaders = origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      : {}

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Route handlers — each returns { status, body }
      let result

      if (path === '/health' && request.method === 'GET') {
        result = { status: 200, body: { status: 'ok', timestamp: new Date().toISOString() } }
      } else if (path === '/share' && request.method === 'POST') {
        result = await handleCreateShare(request, env)
      } else if (path.startsWith('/share/') && request.method === 'DELETE') {
        result = await handleDeleteShare(request, env, path)
      } else if (path.startsWith('/access/') && request.method === 'GET') {
        result = await handleGetAccess(request, env, path)
      } else if (path === '/log' && request.method === 'POST') {
        result = await handleLog(request, env)
      } else if (path.startsWith('/activity/') && request.method === 'GET') {
        result = await handleGetActivity(request, env, path, url)
      } else if (path === '/token' && request.method === 'POST') {
        result = await handleGetToken(request, env)
      } else if (path === '/check-access' && request.method === 'POST') {
        result = await handleCheckAccess(request, env)
      } else if (path === '/api/references' && request.method === 'POST') {
        result = await handleCreateReference(request, env)
      } else {
        return jsonResponse({ error: 'Not found' }, 404, corsHeaders)
      }

      return jsonResponse(result.body, result.status, corsHeaders)
    } catch (e) {
      console.error('Worker error:', e)
      return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders)
    }
  }
}

/**
 * Verify the caller's identity via Box API.
 *
 * - Extracts the Bearer token from the Authorization header.
 * - Checks AUTH_CACHE (keyed by SHA-256 hash of token) to avoid redundant Box calls.
 * - Falls back to GET https://api.box.com/2.0/users/me to validate.
 * - Caches successful results for 5 minutes.
 *
 * @returns {{ valid: true, token: string, userId: string, login: string }
 *          | { valid: false, status: number, error: string }}
 */
async function verifyOwner(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, status: 401, error: 'Missing authorization token' }
  }

  const token = authHeader.slice(7)
  if (!token) {
    return { valid: false, status: 401, error: 'Empty authorization token' }
  }

  // Cache key = SHA-256 hash of token (never store the raw token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const cacheKey = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Check cache first
  const cached = await env.AUTH_CACHE.get(cacheKey, 'json')
  if (cached) {
    return { valid: true, token, userId: cached.userId, login: cached.login }
  }

  // Verify against Box API
  let boxRes
  try {
    boxRes = await fetch('https://api.box.com/2.0/users/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
  } catch (err) {
    console.error('Box API request failed:', err)
    return { valid: false, status: 401, error: 'Failed to verify token with Box' }
  }

  if (!boxRes.ok) {
    return { valid: false, status: 401, error: 'Invalid or expired Box token' }
  }

  const boxUser = await boxRes.json()
  const userId = boxUser.id
  const login = boxUser.login

  // Cache for 5 minutes
  await env.AUTH_CACHE.put(cacheKey, JSON.stringify({ userId, login }), {
    expirationTtl: 300
  })

  return { valid: true, token, userId, login }
}

/**
 * Find the first share record whose folder_path matches, and return its owner_user_id.
 * Returns null if no shares exist for the folder.
 */
async function findOwnerForFolder(env, folderPath) {
  const list = await env.SHARES.list()
  for (const key of list.keys) {
    const share = await env.SHARES.get(key.name, 'json')
    if (share?.folder_path === folderPath) {
      return share.owner_user_id || null
    }
  }
  return null
}

/**
 * Create a new share
 * POST /share
 * Body: { folder_path, collaborator_email, permission, expires_at? }
 */
async function handleCreateShare(request, env) {
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { status: auth.status, body: { error: auth.error } }
  }

  let body
  try {
    body = await request.json()
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const { folder_path, collaborator_email, permission, expires_at } = body

  // Validate required fields
  if (!folder_path || !collaborator_email || !permission) {
    return { status: 400, body: { error: 'Missing required fields: folder_path, collaborator_email, permission' } }
  }

  // Validate permission
  const validPermissions = ['viewer', 'annotator', 'contributor']
  if (!validPermissions.includes(permission)) {
    return { status: 400, body: { error: `Invalid permission. Must be one of: ${validPermissions.join(', ')}` } }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(collaborator_email)) {
    return { status: 400, body: { error: 'Invalid email format' } }
  }

  // Check if share already exists
  const accessKey = makeKey(folder_path, collaborator_email)
  const existingAccess = await env.ACCESS.get(accessKey)
  if (existingAccess) {
    return { status: 409, body: { error: 'Share already exists for this folder and email' } }
  }

  // Create share record (includes owner_user_id for ownership checks)
  const shareId = `sh_${crypto.randomUUID()}`
  const shareData = {
    folder_path,
    collaborator_email,
    permission,
    owner_user_id: auth.userId,
    created_at: new Date().toISOString(),
    expires_at: expires_at || null
  }

  await env.SHARES.put(shareId, JSON.stringify(shareData))

  // Create access lookup record
  const accessData = {
    share_id: shareId,
    granted_at: new Date().toISOString(),
    permission
  }
  await env.ACCESS.put(accessKey, JSON.stringify(accessData))

  // Don't leak owner_user_id to the client
  const { owner_user_id: _, ...publicShareData } = shareData

  return {
    status: 200,
    body: {
      share_id: shareId,
      created: true,
      share: publicShareData
    }
  }
}

/**
 * Delete a share
 * DELETE /share/:shareId
 */
async function handleDeleteShare(request, env, path) {
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { status: auth.status, body: { error: auth.error } }
  }

  const shareId = path.split('/')[2]
  if (!shareId) {
    return { status: 400, body: { error: 'Missing share ID' } }
  }

  const share = await env.SHARES.get(shareId, 'json')
  if (!share) {
    return { status: 404, body: { error: 'Share not found' } }
  }

  // Ownership check
  if (share.owner_user_id && share.owner_user_id !== auth.userId) {
    return { status: 403, body: { error: 'You do not own this share' } }
  }

  // Delete access lookup
  const accessKey = makeKey(share.folder_path, share.collaborator_email)
  await env.ACCESS.delete(accessKey)

  // Delete share record
  await env.SHARES.delete(shareId)

  return { status: 200, body: { deleted: true, share_id: shareId } }
}

/**
 * Get all collaborators for a folder
 * GET /access/:folderPath
 */
async function handleGetAccess(request, env, path) {
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { status: auth.status, body: { error: auth.error } }
  }

  const folderPath = decodeURIComponent(path.split('/access/')[1])
  if (!folderPath) {
    return { status: 400, body: { error: 'Missing folder path' } }
  }

  // List all shares and filter by folder path
  const list = await env.SHARES.list()
  const shares = []
  let folderOwner = null

  for (const key of list.keys) {
    const share = await env.SHARES.get(key.name, 'json')
    if (share?.folder_path === folderPath) {
      if (!folderOwner && share.owner_user_id) {
        folderOwner = share.owner_user_id
      }

      // Get last access time from logs
      const logPrefix = makeKey(folderPath, share.collaborator_email) + '|'
      const logList = await env.LOGS.list({ prefix: logPrefix })

      let lastAccess = null
      let accessCount = 0

      if (logList.keys.length > 0) {
        accessCount = logList.keys.length
        const sortedKeys = logList.keys.map(k => k.name).sort()
        const lastKey = sortedKeys[sortedKeys.length - 1]
        const parts = parseKey(lastKey)
        lastAccess = parts[2] || null
      }

      // Don't leak owner_user_id
      const { owner_user_id: _, ...publicShare } = share
      shares.push({
        ...publicShare,
        share_id: key.name,
        last_accessed: lastAccess,
        access_count: accessCount
      })
    }
  }

  // If no shares exist, return 404
  if (shares.length === 0) {
    return { status: 404, body: { error: 'No shares found for this folder' } }
  }

  // Ownership check
  if (folderOwner && folderOwner !== auth.userId) {
    return { status: 403, body: { error: 'You do not own shares for this folder' } }
  }

  return {
    status: 200,
    body: {
      folder_path: folderPath,
      collaborators: shares
    }
  }
}

/**
 * Log an access event
 * POST /log
 * Body: { action, doc_id?, folder_path, collaborator_email }
 */
async function handleLog(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const { action, doc_id, folder_path, collaborator_email } = body

  // Validate required fields
  if (!action || !folder_path || !collaborator_email) {
    return { status: 400, body: { error: 'Missing required fields: action, folder_path, collaborator_email' } }
  }

  // Validate action
  const validActions = ['view', 'download', 'annotate', 'upload']
  if (!validActions.includes(action)) {
    return { status: 400, body: { error: `Invalid action. Must be one of: ${validActions.join(', ')}` } }
  }

  const timestamp = new Date().toISOString()
  const key = makeKey(folder_path, collaborator_email, timestamp)

  const logData = {
    action,
    doc_id: doc_id || null,
    timestamp
  }

  // Store with 90-day TTL
  await env.LOGS.put(key, JSON.stringify(logData), {
    expirationTtl: 60 * 60 * 24 * 90
  })

  return { status: 200, body: { logged: true, timestamp } }
}

/**
 * Get activity log for a folder
 * GET /activity/:folderPath?since=&limit=
 */
async function handleGetActivity(request, env, path, url) {
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { status: auth.status, body: { error: auth.error } }
  }

  const folderPath = decodeURIComponent(path.split('/activity/')[1])
  if (!folderPath) {
    return { status: 400, body: { error: 'Missing folder path' } }
  }

  // Ownership check: find the owner from any share for this folder
  const folderOwner = await findOwnerForFolder(env, folderPath)
  if (folderOwner === null) {
    return { status: 404, body: { error: 'No shares found for this folder' } }
  }
  if (folderOwner !== auth.userId) {
    return { status: 403, body: { error: 'You do not own shares for this folder' } }
  }

  const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  const logPrefix = encodeURIComponent(folderPath) + '|'
  const list = await env.LOGS.list({ prefix: logPrefix })
  const events = []

  // Filter and collect events
  const filteredKeys = list.keys
    .filter(k => {
      const parts = parseKey(k.name)
      const timestamp = parts[2]
      return timestamp > since
    })
    .slice(0, limit)

  for (const key of filteredKeys) {
    const log = await env.LOGS.get(key.name, 'json')
    if (log) {
      const parts = parseKey(key.name)
      events.push({
        email: parts[1],
        timestamp: parts[2],
        ...log
      })
    }
  }

  // Sort by timestamp descending
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return {
    status: 200,
    body: {
      folder_path: folderPath,
      events,
      total: events.length
    }
  }
}

/**
 * Check if a user has access to a folder and return token info
 * POST /token
 * Body: { email, folder_path }
 *
 * Collaborator-facing — no bearer token required, no owner_user_id leaked.
 */
async function handleGetToken(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const { email, folder_path } = body

  if (!email || !folder_path) {
    return { status: 400, body: { error: 'Missing required fields: email, folder_path' } }
  }

  const accessKey = makeKey(folder_path, email)
  const access = await env.ACCESS.get(accessKey, 'json')

  if (!access) {
    return { status: 200, body: { error: 'Access denied', authorized: false } }
  }

  // Check expiration
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { status: 200, body: { error: 'Access expired', authorized: false } }
  }

  return {
    status: 200,
    body: {
      authorized: true,
      permission: access.permission,
      share_id: access.share_id,
      granted_at: access.granted_at
    }
  }
}

/**
 * Quick check if user has access (for UI display)
 * POST /check-access
 * Body: { email, folder_path }
 *
 * Collaborator-facing — no bearer token required, no owner_user_id leaked.
 */
async function handleCheckAccess(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const { email, folder_path } = body

  if (!email || !folder_path) {
    return { status: 400, body: { error: 'Missing required fields', has_access: false } }
  }

  const accessKey = makeKey(folder_path, email)
  const access = await env.ACCESS.get(accessKey, 'json')

  if (!access) {
    return { status: 200, body: { has_access: false } }
  }

  // Check expiration
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { status: 200, body: { has_access: false, expired: true } }
  }

  return {
    status: 200,
    body: {
      has_access: true,
      permission: access.permission
    }
  }
}

// ─── Box API helpers (used by handleCreateReference) ───────────────────

/**
 * List all items in a Box folder, handling pagination.
 */
async function boxListFolder(token, folderId, fields = 'id,name,type') {
  const entries = []
  let offset = 0
  const limit = 1000

  while (true) {
    const res = await fetch(
      `${BOX_API_BASE}/folders/${folderId}/items?limit=${limit}&offset=${offset}&fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error(`Box list folder ${folderId} failed: ${res.status}`)
    const data = await res.json()
    entries.push(...data.entries)
    if (entries.length >= data.total_count) break
    offset += limit
  }

  return entries
}

/**
 * Traverse a Box path from a root folder, returning the final folder ID.
 * Returns null if any segment is not found.
 */
async function boxResolveFolderPath(token, rootId, pathSegments) {
  let currentId = rootId
  for (const segment of pathSegments) {
    const items = await boxListFolder(token, currentId)
    const folder = items.find(i => i.type === 'folder' && i.name === segment)
    if (!folder) return null
    currentId = folder.id
  }
  return currentId
}

/**
 * Create a folder inside a parent folder. Returns the new folder ID.
 * If the folder already exists (409), returns its existing ID.
 */
async function boxCreateFolder(token, parentId, name) {
  const res = await fetch(`${BOX_API_BASE}/folders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, parent: { id: parentId } }),
  })

  if (res.ok) {
    const data = await res.json()
    return data.id
  }

  // 409 = folder already exists
  if (res.status === 409) {
    const err = await res.json()
    const existingId = err?.context_info?.conflicts?.[0]?.id
    if (existingId) return existingId
  }

  throw new Error(`Box create folder "${name}" in ${parentId} failed: ${res.status}`)
}

/**
 * Ensure a full path of folders exists under a root, creating as needed.
 * Returns the final folder ID.
 */
async function boxEnsureFolderPath(token, rootId, pathSegments) {
  let currentId = rootId
  for (const segment of pathSegments) {
    const items = await boxListFolder(token, currentId)
    const existing = items.find(i => i.type === 'folder' && i.name === segment)
    if (existing) {
      currentId = existing.id
    } else {
      currentId = await boxCreateFolder(token, currentId, segment)
    }
  }
  return currentId
}

/**
 * Upload a file to a Box folder. Returns { id, name, size }.
 */
async function boxUploadFile(token, folderId, fileName, fileBlob) {
  const form = new FormData()
  form.append('attributes', JSON.stringify({
    name: fileName,
    parent: { id: folderId },
  }))
  form.append('file', fileBlob, fileName)

  const res = await fetch(`${BOX_UPLOAD_BASE}/files/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Box upload "${fileName}" to folder ${folderId} failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  const entry = data.entries[0]
  return { id: entry.id, name: entry.name, size: entry.size }
}

/**
 * Find a file by name in a folder. Returns its ID or null.
 */
async function boxFindFile(token, folderId, fileName) {
  const items = await boxListFolder(token, folderId)
  const file = items.find(i => i.type === 'file' && i.name === fileName)
  return file?.id || null
}

/**
 * Read a JSON file from Box by file ID.
 */
async function boxReadJSON(token, fileId) {
  const res = await fetch(`${BOX_API_BASE}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Box read file ${fileId} failed: ${res.status}`)
  return res.json()
}

/**
 * Upload a new version of an existing file.
 */
async function boxUpdateFile(token, fileId, content) {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })

  const res = await fetch(`${BOX_UPLOAD_BASE}/files/${fileId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: blob,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Box update file ${fileId} failed: ${res.status} ${text}`)
  }

  return res.json()
}

// ─── handleCreateReference ─────────────────────────────────────────────

/**
 * Create a new reference (paper or news article) with file uploads.
 * POST /api/references
 *
 * Accepts multipart/form-data with metadata fields and file parts.
 * Uses the caller's Box token to upload files and update library.json.
 */
async function handleCreateReference(request, env) {
  // 1. Auth — reuse existing Box token verification
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { status: auth.status, body: { error: auth.error } }
  }

  // 2. Parse multipart form data
  let form
  try {
    form = await request.formData()
  } catch {
    return { status: 400, body: { error: 'Invalid multipart form data' } }
  }

  // Extract metadata fields
  const referenceType = form.get('reference_type') || 'paper'
  const title = form.get('title')
  const folderId = form.get('folder_id') || null
  const sourceName = form.get('source_name') || null
  const publishedAt = form.get('published_at') || null
  const url = form.get('url') || null
  let aiChatSourceFile = form.get('ai_chat_source_file') || null

  let authors = []
  try { authors = JSON.parse(form.get('authors') || '[]') } catch { /* ignore */ }

  let tags = []
  try { tags = JSON.parse(form.get('tags') || '[]') } catch { /* ignore */ }

  // Extract file parts
  const files = form.getAll('files')
  if (!files.length || !(files[0] instanceof File)) {
    return { status: 400, body: { error: 'At least one file is required in files[] field' } }
  }

  if (!title) {
    return { status: 400, body: { error: 'title is required' } }
  }

  // Validate ai_chat_source_file references an actual uploaded filename
  const uploadedNames = new Set(files.map(f => f.name))
  if (aiChatSourceFile && !uploadedNames.has(aiChatSourceFile)) {
    return { status: 400, body: { error: `ai_chat_source_file "${aiChatSourceFile}" not found in uploaded files` } }
  }
  // Default: prefer .md file for news, first file otherwise
  if (!aiChatSourceFile) {
    const mdFile = files.find(f => f.name.endsWith('.md'))
    aiChatSourceFile = mdFile ? mdFile.name : files[0].name
  }

  // 3. Resolve ScholarLib root folder in Box
  //    The root folder is named "ScholarLib" under Box root (folder 0)
  const rootItems = await boxListFolder(auth.token, '0')
  const scholarLibFolder = rootItems.find(i => i.type === 'folder' && i.name === 'ScholarLib')
  if (!scholarLibFolder) {
    return { status: 500, body: { error: 'ScholarLib root folder not found in Box' } }
  }
  const rootId = scholarLibFolder.id

  // 4. Build storage path and ensure folders exist
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

  let targetFolderId
  if (referenceType === 'news_article') {
    // News files: News/{slug}/
    targetFolderId = await boxEnsureFolderPath(auth.token, rootId, ['News', slug])
  } else {
    // Paper files: PDFs/
    targetFolderId = await boxEnsureFolderPath(auth.token, rootId, ['PDFs'])
  }

  // 5. Upload files to Box
  const uploadedFiles = []
  for (const file of files) {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type })
    const result = await boxUploadFile(auth.token, targetFolderId, file.name, blob)
    const boxPath = referenceType === 'news_article'
      ? `News/${slug}/${file.name}`
      : `PDFs/${file.name}`
    uploadedFiles.push({
      filename: file.name,
      box_path: boxPath,
      box_file_id: result.id,
      content_type: file.type,
      size: result.size,
    })
  }

  // 6. Read library.json, add document, write back
  const systemFolderId = await boxResolveFolderPath(auth.token, rootId, ['_system'])
  if (!systemFolderId) {
    return { status: 500, body: { error: '_system folder not found in ScholarLib' } }
  }

  const libraryFileId = await boxFindFile(auth.token, systemFolderId, 'library.json')
  if (!libraryFileId) {
    return { status: 500, body: { error: 'library.json not found in _system' } }
  }

  const library = await boxReadJSON(auth.token, libraryFileId)

  // Determine primary file (PDF for viewer) and AI source file
  const pdfFile = uploadedFiles.find(f => f.filename.endsWith('.pdf'))
  const mdFile = uploadedFiles.find(f => f.filename.endsWith('.md'))
  const primaryFile = pdfFile || uploadedFiles[0]
  const aiSourcePath = mdFile ? mdFile.box_path : primaryFile.box_path

  const docId = `d_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
  const now = new Date().toISOString()

  const doc = {
    id: docId,
    folder_id: folderId,
    reference_type: referenceType,
    box_path: primaryFile.box_path,
    box_file_id: primaryFile.box_file_id,
    filename: primaryFile.filename,
    added_at: now,
    added_by: auth.login || 'litorbit',
    source_name: sourceName,
    published_at: publishedAt,
    url: url,
    ai_chat_source_file: aiSourcePath,
    files: uploadedFiles,
    metadata: {
      title,
      authors: authors.map(a => typeof a === 'string' ? { full: a, last: a.split(' ').pop() } : a),
      year: publishedAt ? new Date(publishedAt).getFullYear().toString() : null,
      source: sourceName,
    },
    user_data: {
      read: false,
      read_at: null,
      starred: false,
      tags: tags,
      rating: null,
      custom_fields: {},
    },
    import_source: { type: 'litorbit', imported_at: now },
    index_status: {
      status: 'none',
      indexed_at: null,
      indexed_on_device: null,
      model_used: null,
      chunk_count: 0,
      embedding_version: null,
    },
  }

  library.documents = library.documents || {}
  library.documents[docId] = doc
  library.schema_revision = (library.schema_revision || 0) + 1
  library.last_modified = now
  library.last_modified_by = auth.login || 'litorbit'

  await boxUpdateFile(auth.token, libraryFileId, library)

  return {
    status: 201,
    body: {
      reference_id: docId,
      files: uploadedFiles.map(f => ({
        filename: f.filename,
        box_file_id: f.box_file_id,
        size: f.size,
      })),
      created_at: now,
    },
  }
}
