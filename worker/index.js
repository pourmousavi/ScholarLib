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
 * - ACCESS: Access lookup (folderPath::email -> access data)
 * - LOGS: Activity logs with 90-day TTL
 */

export default {
  async fetch(request, env) {
    // CORS handling
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim())

    // Allow requests without origin (e.g., curl) in development
    const isAllowedOrigin = !origin || allowedOrigins.includes(origin)

    if (!isAllowedOrigin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      let response

      // Route handlers
      if (path === '/health' && request.method === 'GET') {
        response = { status: 'ok', timestamp: new Date().toISOString() }
      } else if (path === '/share' && request.method === 'POST') {
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
      } else if (path === '/check-access' && request.method === 'POST') {
        response = await handleCheckAccess(request, env)
      } else {
        response = { error: 'Not found' }
        return new Response(JSON.stringify(response), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (e) {
      console.error('Worker error:', e)
      return new Response(JSON.stringify({ error: e.message || 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
}

/**
 * Verify that the requesting user owns the folder
 * Uses Box API to check folder ownership
 */
async function verifyOwner(request, env, folderPath) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization token' }
  }

  const token = authHeader.slice(7)

  // For now, we trust the token if present
  // In production, verify against Box API:
  // const boxUser = await fetch('https://api.box.com/2.0/users/me', {
  //   headers: { 'Authorization': `Bearer ${token}` }
  // }).then(r => r.json())

  return { valid: true, token }
}

/**
 * Create a new share
 * POST /share
 * Body: { folder_path, collaborator_email, permission, expires_at? }
 */
async function handleCreateShare(request, env) {
  // Verify ownership
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { error: auth.error }
  }

  const { folder_path, collaborator_email, permission, expires_at } = await request.json()

  // Validate required fields
  if (!folder_path || !collaborator_email || !permission) {
    return { error: 'Missing required fields: folder_path, collaborator_email, permission' }
  }

  // Validate permission
  const validPermissions = ['viewer', 'annotator', 'contributor']
  if (!validPermissions.includes(permission)) {
    return { error: `Invalid permission. Must be one of: ${validPermissions.join(', ')}` }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(collaborator_email)) {
    return { error: 'Invalid email format' }
  }

  // Check if share already exists
  const accessKey = `${folder_path}::${collaborator_email}`
  const existingAccess = await env.ACCESS.get(accessKey)
  if (existingAccess) {
    return { error: 'Share already exists for this folder and email' }
  }

  // Create share record
  const shareId = `sh_${crypto.randomUUID()}`
  const shareData = {
    folder_path,
    collaborator_email,
    permission,
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

  return {
    share_id: shareId,
    created: true,
    share: shareData
  }
}

/**
 * Delete a share
 * DELETE /share/:shareId
 */
async function handleDeleteShare(request, env, path) {
  // Verify ownership
  const auth = await verifyOwner(request, env)
  if (!auth.valid) {
    return { error: auth.error }
  }

  const shareId = path.split('/')[2]
  if (!shareId) {
    return { error: 'Missing share ID' }
  }

  const share = await env.SHARES.get(shareId, 'json')
  if (!share) {
    return { error: 'Share not found' }
  }

  // Delete access lookup
  const accessKey = `${share.folder_path}::${share.collaborator_email}`
  await env.ACCESS.delete(accessKey)

  // Delete share record
  await env.SHARES.delete(shareId)

  return { deleted: true, share_id: shareId }
}

/**
 * Get all collaborators for a folder
 * GET /access/:folderPath
 */
async function handleGetAccess(request, env, path) {
  const folderPath = decodeURIComponent(path.split('/access/')[1])
  if (!folderPath) {
    return { error: 'Missing folder path' }
  }

  // List all shares and filter by folder path
  const list = await env.SHARES.list()
  const shares = []

  for (const key of list.keys) {
    const share = await env.SHARES.get(key.name, 'json')
    if (share?.folder_path === folderPath) {
      // Get last access time from logs
      const logPrefix = `${folderPath}::${share.collaborator_email}::`
      const logList = await env.LOGS.list({ prefix: logPrefix })

      // Find most recent log entry
      let lastAccess = null
      let accessCount = 0

      if (logList.keys.length > 0) {
        accessCount = logList.keys.length
        const sortedKeys = logList.keys.map(k => k.name).sort()
        const lastKey = sortedKeys[sortedKeys.length - 1]
        lastAccess = lastKey.split('::')[2] || null
      }

      shares.push({
        ...share,
        share_id: key.name,
        last_accessed: lastAccess,
        access_count: accessCount
      })
    }
  }

  return {
    folder_path: folderPath,
    collaborators: shares
  }
}

/**
 * Log an access event
 * POST /log
 * Body: { action, doc_id?, folder_path, collaborator_email }
 */
async function handleLog(request, env) {
  const { action, doc_id, folder_path, collaborator_email } = await request.json()

  // Validate required fields
  if (!action || !folder_path || !collaborator_email) {
    return { error: 'Missing required fields: action, folder_path, collaborator_email' }
  }

  // Validate action
  const validActions = ['view', 'download', 'annotate', 'upload']
  if (!validActions.includes(action)) {
    return { error: `Invalid action. Must be one of: ${validActions.join(', ')}` }
  }

  const timestamp = new Date().toISOString()
  const key = `${folder_path}::${collaborator_email}::${timestamp}`

  const logData = {
    action,
    doc_id: doc_id || null,
    timestamp
  }

  // Store with 90-day TTL
  await env.LOGS.put(key, JSON.stringify(logData), {
    expirationTtl: 60 * 60 * 24 * 90
  })

  return { logged: true, timestamp }
}

/**
 * Get activity log for a folder
 * GET /activity/:folderPath?since=&limit=
 */
async function handleGetActivity(request, env, path, url) {
  const folderPath = decodeURIComponent(path.split('/activity/')[1])
  if (!folderPath) {
    return { error: 'Missing folder path' }
  }

  const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  const list = await env.LOGS.list({ prefix: `${folderPath}::` })
  const events = []

  // Filter and collect events
  const filteredKeys = list.keys
    .filter(k => {
      const timestamp = k.name.split('::')[2]
      return timestamp > since
    })
    .slice(0, limit)

  for (const key of filteredKeys) {
    const log = await env.LOGS.get(key.name, 'json')
    if (log) {
      const parts = key.name.split('::')
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
    folder_path: folderPath,
    events,
    total: events.length
  }
}

/**
 * Check if a user has access to a folder and return token info
 * POST /token
 * Body: { email, folder_path }
 */
async function handleGetToken(request, env) {
  const { email, folder_path } = await request.json()

  if (!email || !folder_path) {
    return { error: 'Missing required fields: email, folder_path' }
  }

  const accessKey = `${folder_path}::${email}`
  const access = await env.ACCESS.get(accessKey, 'json')

  if (!access) {
    return { error: 'Access denied', authorized: false }
  }

  // Check expiration
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { error: 'Access expired', authorized: false }
  }

  // Return access confirmation
  // In production, this could return a signed JWT or exchange for a Box token
  return {
    authorized: true,
    permission: access.permission,
    share_id: access.share_id,
    granted_at: access.granted_at
  }
}

/**
 * Quick check if user has access (for UI display)
 * POST /check-access
 * Body: { email, folder_path }
 */
async function handleCheckAccess(request, env) {
  const { email, folder_path } = await request.json()

  if (!email || !folder_path) {
    return { error: 'Missing required fields', has_access: false }
  }

  const accessKey = `${folder_path}::${email}`
  const access = await env.ACCESS.get(accessKey, 'json')

  if (!access) {
    return { has_access: false }
  }

  // Check expiration
  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return { has_access: false, expired: true }
  }

  return {
    has_access: true,
    permission: access.permission
  }
}
