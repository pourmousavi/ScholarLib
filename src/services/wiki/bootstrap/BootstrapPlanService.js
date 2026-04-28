import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

export const BOOTSTRAP_SECTIONS = ['own_papers', 'external_anchors']

const DEFAULT_TARGETS = {
  own_papers: { min: 25, max: 30 },
  external_anchors: { min: 10, max: 15 },
}

const STATUS_VALUES = ['queued', 'in_progress', 'ingested', 'deferred']

function nowIso() {
  return new Date().toISOString()
}

function emptyPlan() {
  return {
    own_papers: [],
    external_anchors: [],
    themes: [],
    targets: { ...DEFAULT_TARGETS },
    schema_revision_taken: false,
    schema_revision_at_paper: null,
    created_at: nowIso(),
    last_updated: nowIso(),
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function ensureSection(section) {
  if (!BOOTSTRAP_SECTIONS.includes(section)) {
    throw new Error(`Unknown bootstrap section: ${section}`)
  }
}

function reorderEntries(entries) {
  return entries.map((entry, index) => ({ ...entry, order: index + 1 }))
}

function sortByOrderThenAdded(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      const orderDiff = (a.order ?? Infinity) - (b.order ?? Infinity)
      if (orderDiff !== 0) return orderDiff
      return String(a.added_at || '').localeCompare(String(b.added_at || ''))
    })
}

function findIndex(entries, scholarlibDocId) {
  return entries.findIndex((entry) => entry.scholarlib_doc_id === scholarlibDocId)
}

export class BootstrapPlanService {
  constructor({ adapter } = {}) {
    if (!adapter) throw new Error('BootstrapPlanService requires a storage adapter')
    this.adapter = adapter
  }

  async loadPlan() {
    const stored = await readJSONOrNull(this.adapter, WikiPaths.phase3BootstrapPlan)
    if (!stored) return emptyPlan()
    return {
      ...emptyPlan(),
      ...stored,
      own_papers: Array.isArray(stored.own_papers) ? stored.own_papers : [],
      external_anchors: Array.isArray(stored.external_anchors) ? stored.external_anchors : [],
      themes: Array.isArray(stored.themes) ? stored.themes : [],
      targets: { ...DEFAULT_TARGETS, ...(stored.targets || {}) },
    }
  }

  async savePlan(plan) {
    if (!plan || typeof plan !== 'object') throw new Error('savePlan requires a plan object')
    const next = {
      ...emptyPlan(),
      ...plan,
      own_papers: reorderEntries(sortByOrderThenAdded(plan.own_papers || [])),
      external_anchors: reorderEntries(sortByOrderThenAdded(plan.external_anchors || [])),
      themes: Array.from(new Set((plan.themes || []).filter(Boolean))),
      last_updated: nowIso(),
    }
    if (!next.created_at) next.created_at = nowIso()
    await this.adapter.createFolder(WikiPaths.phase3Root)
    await writeJSONWithRevision(this.adapter, WikiPaths.phase3BootstrapPlan, next)
    return next
  }

  async addPaper(section, scholarlibDocId, theme, extra = {}) {
    ensureSection(section)
    if (!scholarlibDocId) throw new Error('addPaper requires a scholarlibDocId')
    const plan = await this.loadPlan()
    const entries = plan[section]
    if (findIndex(entries, scholarlibDocId) >= 0) {
      throw new Error(`Paper already in ${section}: ${scholarlibDocId}`)
    }
    if (theme && !plan.themes.includes(theme)) plan.themes.push(theme)
    const entry = {
      scholarlib_doc_id: scholarlibDocId,
      order: entries.length + 1,
      theme: theme || null,
      notes: extra.notes || '',
      status: 'queued',
      added_at: nowIso(),
      paper_page_id: null,
      ingested_at: null,
    }
    if (section === 'external_anchors') entry.why_anchor = extra.why_anchor || ''
    plan[section] = reorderEntries([...entries, entry])
    return this.savePlan(plan)
  }

  async removePaper(section, scholarlibDocId) {
    ensureSection(section)
    const plan = await this.loadPlan()
    plan[section] = reorderEntries(plan[section].filter((entry) => entry.scholarlib_doc_id !== scholarlibDocId))
    return this.savePlan(plan)
  }

  async reorder(section, scholarlibDocId, newOrder) {
    ensureSection(section)
    if (!Number.isFinite(newOrder) || newOrder < 1) {
      throw new Error('reorder requires a positive integer order')
    }
    const plan = await this.loadPlan()
    const entries = clone(plan[section])
    const idx = findIndex(entries, scholarlibDocId)
    if (idx < 0) throw new Error(`Paper not found in ${section}: ${scholarlibDocId}`)
    const [removed] = entries.splice(idx, 1)
    const target = Math.min(Math.max(0, Math.round(newOrder) - 1), entries.length)
    entries.splice(target, 0, removed)
    plan[section] = reorderEntries(entries)
    return this.savePlan(plan)
  }

  async setStatus(section, scholarlibDocId, status, patch = {}) {
    ensureSection(section)
    if (!STATUS_VALUES.includes(status)) {
      throw new Error(`Invalid status: ${status}`)
    }
    const plan = await this.loadPlan()
    const idx = findIndex(plan[section], scholarlibDocId)
    if (idx < 0) throw new Error(`Paper not found in ${section}: ${scholarlibDocId}`)
    plan[section][idx] = { ...plan[section][idx], ...patch, status }
    if (status === 'ingested' && !plan[section][idx].ingested_at) {
      plan[section][idx].ingested_at = nowIso()
    }
    return this.savePlan(plan)
  }

  async markIngested(scholarlibDocId, paperPageId) {
    const plan = await this.loadPlan()
    for (const section of BOOTSTRAP_SECTIONS) {
      const idx = findIndex(plan[section], scholarlibDocId)
      if (idx >= 0) {
        plan[section][idx] = {
          ...plan[section][idx],
          status: 'ingested',
          paper_page_id: paperPageId || plan[section][idx].paper_page_id,
          ingested_at: plan[section][idx].ingested_at || nowIso(),
        }
        return this.savePlan(plan)
      }
    }
    throw new Error(`Paper not found in plan: ${scholarlibDocId}`)
  }

  async getIngestionStatus() {
    const plan = await this.loadPlan()
    const summarise = (entries) => {
      const summary = { total: entries.length, queued: 0, in_progress: 0, ingested: 0, deferred: 0 }
      for (const entry of entries) {
        const status = STATUS_VALUES.includes(entry.status) ? entry.status : 'queued'
        summary[status] += 1
      }
      return summary
    }
    return {
      own_papers: summarise(plan.own_papers),
      external_anchors: summarise(plan.external_anchors),
      themes: plan.themes.slice(),
      targets: plan.targets,
    }
  }

  async canIngestExternal(scholarlibDocId) {
    const plan = await this.loadPlan()
    const idx = findIndex(plan.external_anchors, scholarlibDocId)
    if (idx < 0) return { allowed: false, reason: 'not_in_external_anchors' }
    const own = plan.own_papers
    if (own.length === 0) return { allowed: false, reason: 'no_own_papers_yet' }
    const blocking = own.filter((entry) => entry.status === 'queued' || entry.status === 'in_progress')
    if (blocking.length > 0) {
      return { allowed: false, reason: 'own_papers_pending', blocking_count: blocking.length }
    }
    return { allowed: true }
  }

  async markSchemaRevisionTaken(paperIndex) {
    const plan = await this.loadPlan()
    plan.schema_revision_taken = true
    plan.schema_revision_at_paper = paperIndex ?? plan.schema_revision_at_paper
    return this.savePlan(plan)
  }

  async getOwnPapersIngestedCount() {
    const plan = await this.loadPlan()
    return plan.own_papers.filter((entry) => entry.status === 'ingested').length
  }

  async addTheme(theme) {
    if (!theme) return this.loadPlan()
    const plan = await this.loadPlan()
    if (!plan.themes.includes(theme)) plan.themes.push(theme)
    return this.savePlan(plan)
  }

  async removeTheme(theme) {
    const plan = await this.loadPlan()
    plan.themes = plan.themes.filter((entry) => entry !== theme)
    for (const section of BOOTSTRAP_SECTIONS) {
      plan[section] = plan[section].map((entry) => (entry.theme === theme ? { ...entry, theme: null } : entry))
    }
    return this.savePlan(plan)
  }
}

export { emptyPlan as createEmptyPlan, DEFAULT_TARGETS, STATUS_VALUES }
