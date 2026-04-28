import { StorageError, STORAGE_ERRORS } from '../storage/StorageAdapter'

export async function readJSONOrNull(adapter, path) {
  try {
    return await adapter.readJSON(path)
  } catch (error) {
    if (error.code === STORAGE_ERRORS.NOT_FOUND) return null
    throw error
  }
}

export async function writeJSONWithRevision(adapter, path, data) {
  const text = JSON.stringify(data, null, 2)
  if (typeof adapter.writeTextIfRevision !== 'function') {
    await adapter.writeJSON(path, data)
    return null
  }

  let expectedRevision = null
  try {
    expectedRevision = (await adapter.getMetadata(path)).revision
  } catch (error) {
    if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
  }
  return adapter.writeTextIfRevision(path, text, expectedRevision)
}

export async function ensureFolders(adapter, paths) {
  for (const path of paths) {
    await adapter.createFolder(path)
  }
}

export function requireRevisionSupport(adapter) {
  const missing = ['readTextWithMetadata', 'writeTextIfRevision', 'getMetadata']
    .filter((name) => typeof adapter?.[name] !== 'function')
  if (missing.length > 0) {
    throw new StorageError(
      STORAGE_ERRORS.NETWORK_ERROR,
      `Storage adapter is missing wiki revision methods: ${missing.join(', ')}`
    )
  }
}
