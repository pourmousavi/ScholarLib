import { WikiPaths } from './WikiPaths'
import { requireRevisionSupport } from './WikiStorage'

export class CapabilityService {
  static async check(adapter) {
    const checks = []
    const startedAt = new Date().toISOString()

    const addCheck = async (name, fn) => {
      try {
        await fn()
        checks.push({ name, ok: true })
      } catch (error) {
        checks.push({ name, ok: false, message: error.message, code: error.code || null })
      }
    }

    await addCheck('revision_methods', () => requireRevisionSupport(adapter))
    await addCheck('create_wiki_folders', async () => {
      await adapter.createFolder(WikiPaths.root)
      await adapter.createFolder(WikiPaths.pagesRoot)
      await adapter.createFolder(WikiPaths.systemRoot)
    })
    await addCheck('metadata', async () => {
      await adapter.getMetadata(WikiPaths.root)
    })

    return {
      checked_at: startedAt,
      ok: checks.every((check) => check.ok),
      provider: adapter?.getProviderName?.() || 'unknown',
      checks,
    }
  }
}
