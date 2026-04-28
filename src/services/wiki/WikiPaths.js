const WIKI_ROOT = '_wiki'
const WIKI_SYSTEM_ROOT = `${WIKI_ROOT}/_system`

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
}
