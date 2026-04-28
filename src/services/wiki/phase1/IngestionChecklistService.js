import { ulid } from 'ulid'
import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

export const CHECKLIST_STEP_NAMES = [
  'extract',
  'verify_claims',
  'build_proposal',
  'review',
  'apply',
  'sidecar_regen',
]

export const CHECKLIST_STATUSES = ['pending', 'running', 'success', 'failed']

const STEP_DEFAULTS = {
  extract: { model_used: null, tokens: 0, cost_usd: 0, duration_seconds: 0, errors: [] },
  verify_claims: { claims_total: 0, claims_supported: 0, claims_weak: 0, claims_unsupported: 0, duration_seconds: 0, cost_usd: 0, errors: [] },
  build_proposal: { page_changes_count: 0, candidates_count: 0, duration_seconds: 0, errors: [] },
  review: { duration_seconds_human: 0, changes_approved: 0, changes_edited: 0, changes_rejected: 0, errors: [] },
  apply: { duration_seconds: 0, op_id: null, errors: [] },
  sidecar_regen: { duration_seconds: 0, errors: [] },
}

function emptySteps() {
  return CHECKLIST_STEP_NAMES.map((name) => ({
    name,
    status: 'pending',
    ...STEP_DEFAULTS[name],
  }))
}

function nowIso() {
  return new Date().toISOString()
}

export function createChecklistRecord({
  paperId,
  scholarlibDocId,
  paperTitle,
  schemaVersionAtIngestion = '1.0',
  ingestedAt,
} = {}) {
  if (!paperId) throw new Error('createChecklistRecord requires paperId')
  return {
    paper_id: paperId,
    scholarlib_doc_id: scholarlibDocId || null,
    paper_title: paperTitle || '',
    ingested_at: ingestedAt || nowIso(),
    schema_version_at_ingestion: schemaVersionAtIngestion,
    steps: emptySteps(),
    observations: '',
    schema_issues_observed: [],
    reingestion_required: false,
  }
}

function findStep(checklist, name) {
  const step = checklist.steps?.find((entry) => entry.name === name)
  if (!step) throw new Error(`Unknown checklist step: ${name}`)
  return step
}

export function transitionStep(checklist, name, status, patch = {}) {
  if (!CHECKLIST_STATUSES.includes(status)) throw new Error(`Invalid checklist status: ${status}`)
  const step = findStep(checklist, name)
  step.status = status
  if (patch && typeof patch === 'object') {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (key === 'errors' && Array.isArray(value)) {
        step.errors = [...(step.errors || []), ...value]
      } else {
        step[key] = value
      }
    }
  }
  return step
}

const SCHEMA_ISSUE_VOCABULARY = [
  'frontmatter_field_missing',
  'frontmatter_field_unused',
  'risk_tier_wrong',
  'verifier_overzealous',
  'verifier_underzealous',
  'concept_page_too_thin',
  'paper_page_too_long',
  'evidence_locator_stale',
  'sensitivity_misclassified',
  'wikilink_resolution_failed',
  'extraction_truncated',
  'other',
]

export function getSchemaIssueVocabulary() {
  return [...SCHEMA_ISSUE_VOCABULARY]
}

export function normalizeSchemaIssues(issues) {
  if (!Array.isArray(issues)) return []
  const known = new Set(SCHEMA_ISSUE_VOCABULARY)
  const seen = new Set()
  const result = []
  for (const raw of issues) {
    if (!raw) continue
    const tag = typeof raw === 'string' ? raw : raw.tag
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push({
      tag,
      note: typeof raw === 'object' && raw.note ? String(raw.note) : '',
      vocabulary: known.has(tag) ? 'standard' : 'custom',
    })
  }
  return result
}

export class IngestionChecklistService {
  constructor({ adapter } = {}) {
    if (!adapter) throw new Error('IngestionChecklistService requires a storage adapter')
    this.adapter = adapter
  }

  static newChecklist(args = {}) {
    const paperId = args.paperId || `p_${ulid()}`
    return createChecklistRecord({ ...args, paperId })
  }

  static beginStep(checklist, name) {
    return transitionStep(checklist, name, 'running', { started_at: nowIso() })
  }

  static succeedStep(checklist, name, patch = {}) {
    return transitionStep(checklist, name, 'success', { completed_at: nowIso(), ...patch })
  }

  static failStep(checklist, name, error, patch = {}) {
    const message = error?.message || String(error || 'Unknown error')
    return transitionStep(checklist, name, 'failed', {
      completed_at: nowIso(),
      errors: [message],
      ...patch,
    })
  }

  static recordObservations(checklist, observations, schemaIssues = [], reingestionRequired = false) {
    checklist.observations = String(observations || '')
    checklist.schema_issues_observed = normalizeSchemaIssues(schemaIssues)
    checklist.reingestion_required = Boolean(reingestionRequired)
    return checklist
  }

  static computeProgress(checklist) {
    const total = checklist.steps.length
    const completed = checklist.steps.filter((step) => step.status === 'success').length
    const failed = checklist.steps.filter((step) => step.status === 'failed').length
    const running = checklist.steps.filter((step) => step.status === 'running').length
    return { total, completed, failed, running }
  }

  static totalCostUsd(checklist) {
    return checklist.steps.reduce((sum, step) => sum + (Number(step.cost_usd) || 0), 0)
  }

  async save(checklist) {
    if (!checklist?.paper_id) throw new Error('Cannot save checklist without paper_id')
    await this.adapter.createFolder(WikiPaths.phase1ChecklistsRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.phase1Checklist(checklist.paper_id), checklist)
    return checklist
  }

  async load(paperId) {
    return readJSONOrNull(this.adapter, WikiPaths.phase1Checklist(paperId))
  }

  async listAll() {
    let entries
    try {
      entries = await this.adapter.listFolder(WikiPaths.phase1ChecklistsRoot)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(this.adapter, `${WikiPaths.phase1ChecklistsRoot}/${entry.name}`)
      if (record) records.push(record)
    }
    return records.sort((a, b) => String(a.ingested_at).localeCompare(String(b.ingested_at)))
  }
}
