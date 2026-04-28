const WIKI_ROOT = 'Wiki'
const WIKI_SYSTEM_ROOT = '_system/wiki'

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
  pagesRoot: `${WIKI_ROOT}/pages`,
  systemRoot: WIKI_SYSTEM_ROOT,
  state: `${WIKI_SYSTEM_ROOT}/state.json`,
  pagesSidecar: `${WIKI_SYSTEM_ROOT}/pages.json`,
  aliasesSidecar: `${WIKI_SYSTEM_ROOT}/aliases.json`,
  opsPendingRoot: `${WIKI_SYSTEM_ROOT}/ops/pending`,
  opsCommittedRoot: `${WIKI_SYSTEM_ROOT}/ops/committed`,
  opsArchivedRoot: `${WIKI_SYSTEM_ROOT}/ops/archived`,

  page(pageId) {
    const safeId = cleanSegment(pageId)
    if (!safeId) throw new Error('Wiki page id is required')
    return `${WIKI_ROOT}/pages/${safeId}.md`
  },

  pendingOp(operationId) {
    return `${this.opsPendingRoot}/${cleanSegment(operationId)}.json`
  },

  committedOp(operationId) {
    return `${this.opsCommittedRoot}/${cleanSegment(operationId)}.json`
  },

  archivedOp(operationId) {
    return `${this.opsArchivedRoot}/${cleanSegment(operationId)}.json`
  },
}
