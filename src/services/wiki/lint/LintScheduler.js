import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

const DEFAULT_OPTIONS = {
  ingestion_interval: 5,
  weekly_day: 0, // Sunday
  weekly_min_days_between: 6,
}

const RUN_HISTORY_LIMIT = 50

function emptyState() {
  return {
    last_run_at: null,
    last_run_trigger: null,
    last_weekly_run_at: null,
    ingestion_count_at_last_run: 0,
    runs: [],
  }
}

export class LintScheduler {
  constructor({ adapter, lintService, options = {}, now = () => new Date() } = {}) {
    if (!adapter) throw new Error('LintScheduler requires a storage adapter')
    if (!lintService) throw new Error('LintScheduler requires a LintService')
    this.adapter = adapter
    this.lintService = lintService
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.now = now
  }

  async loadState() {
    const stored = await readJSONOrNull(this.adapter, WikiPaths.phase3LintStateFile)
    return { ...emptyState(), ...(stored || {}) }
  }

  async saveState(state) {
    await this.adapter.createFolder(WikiPaths.phase3Root)
    return writeJSONWithRevision(this.adapter, WikiPaths.phase3LintStateFile, state)
  }

  async shouldRunOnIngestion(ingestionCount, state = null) {
    const current = state || (await this.loadState())
    if (!Number.isFinite(ingestionCount) || ingestionCount <= 0) return false
    if (ingestionCount === current.ingestion_count_at_last_run) return false
    return ingestionCount % this.options.ingestion_interval === 0
  }

  async shouldRunWeekly(state = null) {
    const current = state || (await this.loadState())
    const now = this.now()
    if (now.getUTCDay() !== this.options.weekly_day) return false
    if (!current.last_weekly_run_at) return true
    const last = new Date(current.last_weekly_run_at)
    const days = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
    return days >= this.options.weekly_min_days_between
  }

  async runManual() {
    return this._executeRun('manual', {})
  }

  async runIfDueAfterIngestion(ingestionCount) {
    const state = await this.loadState()
    if (!(await this.shouldRunOnIngestion(ingestionCount, state))) return null
    return this._executeRun('ingestion', { ingestion_count: ingestionCount }, state)
  }

  async runWeeklyIfDue() {
    const state = await this.loadState()
    if (!(await this.shouldRunWeekly(state))) return null
    return this._executeRun('weekly', {}, state)
  }

  async _executeRun(trigger, meta, baseState = null) {
    const state = baseState || (await this.loadState())
    const result = await this.lintService.runAndPersist()
    const now = this.now()
    const runRecord = {
      trigger,
      ran_at: now.toISOString(),
      total_findings: result.summary.total,
      by_rule: result.summary.by_rule,
      report_path: result.path,
      ...meta,
    }
    const nextState = {
      ...state,
      last_run_at: now.toISOString(),
      last_run_trigger: trigger,
      ingestion_count_at_last_run: trigger === 'ingestion' ? (meta.ingestion_count ?? state.ingestion_count_at_last_run) : state.ingestion_count_at_last_run,
      last_weekly_run_at: trigger === 'weekly' ? now.toISOString() : state.last_weekly_run_at,
      runs: [runRecord, ...(state.runs || [])].slice(0, RUN_HISTORY_LIMIT),
    }
    await this.saveState(nextState)
    return { ...result, run: runRecord, state: nextState }
  }
}

export const LINT_SCHEDULER_DEFAULT_OPTIONS = DEFAULT_OPTIONS
