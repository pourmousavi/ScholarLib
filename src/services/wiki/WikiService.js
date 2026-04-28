import { CapabilityService } from './CapabilityService'
import { IntegrityService } from './IntegrityService'
import { OperationLogService } from './OperationLogService'
import { SidecarService } from './SidecarService'
import { WikiStateService } from './WikiStateService'
import { readJSONOrNull } from './WikiStorage'
import { WikiPaths } from './WikiPaths'

export class WikiService {
  static isEnabled(settings) {
    return settings?.global?.wiki?.enabled === true
  }

  static async getStatus(adapter) {
    const state = await WikiStateService.load(adapter)
    const pages = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
    const aliases = await readJSONOrNull(adapter, WikiPaths.aliasesSidecar)
    const committed = await OperationLogService.listCommitted(adapter, 5)
    return {
      state,
      counts: {
        pages: pages?.count ?? state.page_count ?? 0,
        aliases: Object.keys(aliases?.aliases || {}).length,
        alias_conflicts: aliases?.conflicts?.length || 0,
      },
      latest_committed_ops: committed,
    }
  }

  static async initialize(adapter) {
    return WikiStateService.initialize(adapter)
  }

  static async checkCapabilities(adapter) {
    return CapabilityService.check(adapter)
  }

  static async regenerateSidecars(adapter) {
    await WikiStateService.initialize(adapter)
    return SidecarService.regenerate(adapter)
  }

  static async checkIntegrity(adapter) {
    await WikiStateService.initialize(adapter)
    return IntegrityService.check(adapter)
  }

  static async recover(adapter) {
    await WikiStateService.initialize(adapter)
    return OperationLogService.recover(adapter)
  }
}

export {
  CapabilityService,
  IntegrityService,
  OperationLogService,
  SidecarService,
  WikiStateService,
}
