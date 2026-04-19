/**
 * ScholarLib Cloudflare Worker
 *
 * Handles:
 * - Folder sharing management
 * - Access control and validation
 * - Activity logging for collaborators
 *
 * KV Namespaces:
 * - SHARES: Share records (shareId -> share data)
 * - ACCESS: Access lookup (encodedFolderPath|encodedEmail -> access data)
 * - LOGS: Activity logs with 90-day TTL (encodedFolderPath|encodedEmail|timestamp)
 * - AUTH_CACHE: Short-lived Box token verification cache (SHA-256 hash -> user info, 5 min TTL)
 */

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
