function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeValue(value[key])
      return acc
    }, {})
  }
  return value
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeValue(value))
}

export function normalizeMarkdownForHash(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trimEnd()
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text) {
  const input = new TextEncoder().encode(String(text))

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
    return bytesToHex(new Uint8Array(digest))
  }

  const nodeCryptoModule = 'node:crypto'
  const { createHash } = await import(nodeCryptoModule)
  return createHash('sha256').update(input).digest('hex')
}

export async function hashMarkdown(markdown) {
  return sha256Hex(normalizeMarkdownForHash(markdown))
}

export async function hashJson(value) {
  return sha256Hex(canonicalJson(value))
}
