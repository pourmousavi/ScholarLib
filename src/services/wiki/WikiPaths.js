const WIKI_ROOT = '_wiki'
const WIKI_SYSTEM_ROOT = `${WIKI_ROOT}/_system`
const WIKI_PHASE1_ROOT = `${WIKI_ROOT}/_phase1`
const WIKI_PHASE5_ROOT = `${WIKI_ROOT}/_phase5`
const WIKI_PHASE3_ROOT = `${WIKI_ROOT}/_phase3`
const WIKI_BACKUPS_ROOT = `${WIKI_ROOT}/_backups`
const WIKI_LINT_REPORTS_ROOT = `${WIKI_ROOT}/lint-reports`

function cleanSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export const WikiPaths = {
  root: WIKI_ROOT,
  pagesRoot: WIKI_ROOT,
  systemRoot: WIKI_SYSTEM_ROOT,
  schema: `${WIKI_ROOT}/WIKI_SCHEMA.md`,
  state: `${WIKI_SYSTEM_ROOT}/wiki_state.json`,
  pagesSidecar: `${WIKI_SYSTEM_ROOT}/pages.json`,
  aliasesSidecar: `${WIKI_SYSTEM_ROOT}/aliases.json`,
  linksSidecar: `${WIKI_SYSTEM_ROOT}/links.json`,
  claimsSidecar: `${WIKI_SYSTEM_ROOT}/claims.json`,
  sourcesSidecar: `${WIKI_SYSTEM_ROOT}/sources.json`,
  authorsSidecar: `${WIKI_SYSTEM_ROOT}/authors.json`,
  opsRoot: `${WIKI_ROOT}/_ops`,
  proposalsRoot: `${WIKI_ROOT}/_proposals`,
  proposalsArchivedRoot: `${WIKI_ROOT}/_proposals/_archived`,
  costRoot: `${WIKI_ROOT}/_cost`,
  costIndex: `${WIKI_SYSTEM_ROOT}/cost-index.json`,
  positionDraftsRoot: `${WIKI_ROOT}/position/_drafts`,
  chatCandidatesRoot: `${WIKI_ROOT}/_inbox/chat-candidates`,
  archivedChatCandidatesRoot: `${WIKI_ROOT}/_inbox/_archived/chat-candidates`,
  chatRoutingDefaults: `${WIKI_SYSTEM_ROOT}/chat_routing_defaults.json`,

  typeRoot(type) {
    if (type === 'position_draft') return this.positionDraftsRoot
    return `${WIKI_ROOT}/${cleanSegment(type || 'paper')}`
  },

  page(pageId, type = 'paper', handle = pageId) {
    const safeId = cleanSegment(pageId)
    const safeHandle = cleanSegment(handle || pageId)
    if (!safeId) throw new Error('Wiki page id is required')
    return `${this.typeRoot(type)}/${safeHandle}.md`
  },

  opMonthRoot(date = new Date()) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${this.opsRoot}/${year}/${month}`
  },

  pendingOp(operationId, date = new Date()) {
    return `${this.opMonthRoot(date)}/op_${cleanSegment(operationId)}.pending.json`
  },

  committedOp(operationId, date = new Date()) {
    return `${this.opMonthRoot(date)}/op_${cleanSegment(operationId)}.committed.json`
  },

  proposal(proposalId) {
    return `${this.proposalsRoot}/${cleanSegment(proposalId)}.json`
  },

  archivedProposal(proposalId) {
    return `${this.proposalsArchivedRoot}/${cleanSegment(proposalId)}.json`
  },

  costMonthRoot(date = new Date()) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${this.costRoot}/${year}/${month}`
  },

  pendingCost(costId, date = new Date()) {
    return `${this.costMonthRoot(date)}/cost_${cleanSegment(costId)}.pending.json`
  },

  committedCost(costId, date = new Date()) {
    return `${this.costMonthRoot(date)}/cost_${cleanSegment(costId)}.committed.json`
  },

  // Phase 1 scaffolding (archived after Phase 3 per design v2.1 §10).
  phase1Root: WIKI_PHASE1_ROOT,
  phase1ChecklistsRoot: `${WIKI_PHASE1_ROOT}/checklists`,
  phase1UsefulnessRoot: `${WIKI_PHASE1_ROOT}/usefulness`,
  phase1PositionDraftsReviewRoot: `${WIKI_PHASE1_ROOT}/position_drafts_review`,
  phase1Report: `${WIKI_PHASE1_ROOT}/PHASE_1_REPORT.md`,
  phase1OverridesRoot: `${WIKI_PHASE1_ROOT}/overrides`,

  phase1Checklist(paperId) {
    return `${this.phase1ChecklistsRoot}/${cleanSegment(paperId)}.json`
  },

  phase1Usefulness(timestamp) {
    return `${this.phase1UsefulnessRoot}/${cleanSegment(timestamp)}.json`
  },

  phase1PositionDraftReview(draftId) {
    return `${this.phase1PositionDraftsReviewRoot}/${cleanSegment(draftId)}.json`
  },

  phase1Override(overrideId) {
    return `${this.phase1OverridesRoot}/${cleanSegment(overrideId)}.json`
  },

  // Migration system (Phase 1 §4).
  migrationsRoot: `${WIKI_SYSTEM_ROOT}/migrations`,
  migration(migrationId) {
    return `${this.migrationsRoot}/${cleanSegment(migrationId)}.json`
  },

  backupsRoot: WIKI_BACKUPS_ROOT,
  backupRoot(label) {
    return `${WIKI_BACKUPS_ROOT}/${cleanSegment(label)}`
  },

  // Phase 3 controlled bootstrap.
  phase3Root: WIKI_PHASE3_ROOT,
  phase3BootstrapPlan: `${WIKI_PHASE3_ROOT}/bootstrap_plan.json`,
  phase3SchemaRevisionFlag: `${WIKI_PHASE3_ROOT}/schema_revision_taken.json`,
  phase3LintStateFile: `${WIKI_PHASE3_ROOT}/lint_state.json`,
  phase3Report: `${WIKI_PHASE3_ROOT}/PHASE_3_REPORT.md`,

  // Phase 5 chat benchmark.
  phase5Root: WIKI_PHASE5_ROOT,
  phase5BenchmarkQuestions: `${WIKI_PHASE5_ROOT}/benchmark_questions.json`,
  phase5BenchmarkReport: `${WIKI_PHASE5_ROOT}/PHASE_5_BENCHMARK_REPORT.md`,

  chatCandidate(date, slug) {
    return `${this.chatCandidatesRoot}/${cleanSegment(date)}/${cleanSegment(slug)}.json`
  },

  archivedChatCandidate(date, slug) {
    return `${this.archivedChatCandidatesRoot}/${cleanSegment(date)}/${cleanSegment(slug)}.json`
  },

  // Lint reports.
  lintReportsRoot: WIKI_LINT_REPORTS_ROOT,
  lintReport(date) {
    return `${WIKI_LINT_REPORTS_ROOT}/${cleanSegment(date)}.md`
  },
}
