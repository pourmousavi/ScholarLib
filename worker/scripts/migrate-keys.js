/**
 * One-time migration: rewrite ACCESS and LOGS KV keys from the old '::' delimiter
 * to the new '|'-with-encodeURIComponent format.
 *
 * How to run:
 *   1. cd worker/
 *   2. npx wrangler dev          (starts the local dev server)
 *   3. In a separate terminal:
 *      node scripts/migrate-keys.js
 *
 *   Or run directly against production KV:
 *      npx wrangler kv:key list --binding ACCESS | node scripts/migrate-keys.js --namespace ACCESS
 *
 *   The simplest approach is to use wrangler's unstable_dev API or the REST API.
 *   Below is a self-contained script using the Cloudflare REST API.
 *
 * Prerequisites:
 *   - Set CLOUDFLARE_API_TOKEN env var (needs Workers KV read/write permission)
 *   - Set CLOUDFLARE_ACCOUNT_ID env var
 *   - Update the namespace IDs below to match wrangler.toml
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

// Copy these from wrangler.toml
const NAMESPACE_IDS = {
  ACCESS: 'e73acc4a444f4b77a544fc3bb9615a42',
  LOGS: '9204f5d5d3a145f3b92aa17cba901d5c',
}

const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces`

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
}

/**
 * Detect whether a key uses the old '::' format (not the new '|' format).
 */
function isOldFormat(key) {
  return key.includes('::') && !key.includes('|')
}

/**
 * Convert an old '::'-delimited key to the new '|'-with-encodeURIComponent format.
 */
function migrateKey(oldKey) {
  const parts = oldKey.split('::')
  return parts.map(p => encodeURIComponent(p)).join('|')
}

async function listAllKeys(namespaceId) {
  const keys = []
  let cursor = null

  do {
    const url = new URL(`${API_BASE}/${namespaceId}/keys`)
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), { headers })
    const data = await res.json()

    if (!data.success) {
      throw new Error(`Failed to list keys: ${JSON.stringify(data.errors)}`)
    }

    keys.push(...data.result.map(k => k.name))
    cursor = data.result_info?.cursor || null
  } while (cursor)

  return keys
}

async function getValue(namespaceId, key) {
  const url = `${API_BASE}/${namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, { headers })
  return res.text()
}

async function putValue(namespaceId, key, value) {
  const url = `${API_BASE}/${namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: value,
  })
  const data = await res.json()
  if (!data.success) {
    throw new Error(`Failed to put key ${key}: ${JSON.stringify(data.errors)}`)
  }
}

async function deleteKey(namespaceId, key) {
  const url = `${API_BASE}/${namespaceId}/values/${encodeURIComponent(key)}`
  const res = await fetch(url, { method: 'DELETE', headers })
  const data = await res.json()
  if (!data.success) {
    throw new Error(`Failed to delete key ${key}: ${JSON.stringify(data.errors)}`)
  }
}

async function migrateNamespace(name, namespaceId) {
  console.log(`\n=== Migrating ${name} (${namespaceId}) ===`)

  const keys = await listAllKeys(namespaceId)
  const oldKeys = keys.filter(isOldFormat)

  console.log(`  Total keys: ${keys.length}, old-format keys to migrate: ${oldKeys.length}`)

  if (oldKeys.length === 0) {
    console.log('  Nothing to migrate.')
    return
  }

  for (const oldKey of oldKeys) {
    const newKey = migrateKey(oldKey)
    console.log(`  ${oldKey}  →  ${newKey}`)

    const value = await getValue(namespaceId, oldKey)
    await putValue(namespaceId, newKey, value)
    await deleteKey(namespaceId, oldKey)
  }

  console.log(`  Done. Migrated ${oldKeys.length} key(s).`)
}

async function main() {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN env vars.')
    process.exit(1)
  }

  for (const [name, id] of Object.entries(NAMESPACE_IDS)) {
    await migrateNamespace(name, id)
  }

  console.log('\nMigration complete.')
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
