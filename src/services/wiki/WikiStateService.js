import { WikiPaths } from './WikiPaths'
import { ensureFolders, readJSONOrNull, writeJSONWithRevision } from './WikiStorage'

const DEFAULT_STATE = {
  version: '0A',
  enabled: true,
  safety_mode: false,
  safety_reason: null,
  initialized_at: null,
  updated_at: null,
  last_recovery_at: null,
  last_integrity_check: null,
  page_count: 0,
}

export class WikiStateService {
  static defaultState() {
    return { ...DEFAULT_STATE }
  }

  static async initialize(adapter) {
    await ensureFolders(adapter, [
      WikiPaths.root,
      WikiPaths.pagesRoot,
      WikiPaths.systemRoot,
      WikiPaths.opsPendingRoot,
      WikiPaths.opsCommittedRoot,
      WikiPaths.opsArchivedRoot,
    ])

    const existing = await this.load(adapter)
    if (existing.initialized_at) return existing

    const now = new Date().toISOString()
    const state = {
      ...DEFAULT_STATE,
      initialized_at: now,
      updated_at: now,
    }
    await writeJSONWithRevision(adapter, WikiPaths.state, state)
    return state
  }

  static async load(adapter) {
    return {
      ...DEFAULT_STATE,
      ...((await readJSONOrNull(adapter, WikiPaths.state)) || {}),
    }
  }

  static async save(adapter, statePatch) {
    const current = await this.load(adapter)
    const state = {
      ...current,
      ...statePatch,
      updated_at: new Date().toISOString(),
    }
    await writeJSONWithRevision(adapter, WikiPaths.state, state)
    return state
  }

  static async enterSafetyMode(adapter, reason) {
    return this.save(adapter, {
      safety_mode: true,
      safety_reason: reason,
    })
  }
}
