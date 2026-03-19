import { BoxAdapter } from './BoxAdapter'
import { DropboxAdapter } from './DropboxAdapter'

export function createStorageAdapter(provider) {
  if (provider === 'box') return new BoxAdapter()
  if (provider === 'dropbox') return new DropboxAdapter()
  throw new Error(`Unknown storage provider: ${provider}`)
}

export function getSavedProvider() {
  return localStorage.getItem('sv_storage_provider') || null
}

export function saveProvider(provider) {
  localStorage.setItem('sv_storage_provider', provider)
}

export function clearProvider() {
  localStorage.removeItem('sv_storage_provider')
}
