const FRONTMATTER_FIELDS = [
  'title', 'handle', 'type', 'aliases', 'tags',
  'doi', 'sensitivity', 'allowed_providers', 'last_human_review',
  'human_edited', 'auto_generated', 'voice_status', 'scholarlib_doc_id',
]

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function isPrimitiveEqual(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function diffArrays(before = [], after = []) {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))
  const added = after.filter((value) => !beforeSet.has(String(value)))
  const removed = before.filter((value) => !afterSet.has(String(value)))
  return { added, removed }
}

function tokenizeLines(text) {
  return String(text || '').split(/\r?\n/)
}

function lcsTable(a, b) {
  const m = a.length
  const n = b.length
  const table = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) table[i][j] = table[i + 1][j + 1] + 1
      else table[i][j] = Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

function lineDiff(beforeText, afterText) {
  const before = tokenizeLines(beforeText)
  const after = tokenizeLines(afterText)

  if (before.length === 1 && before[0] === '' && after.length === 1 && after[0] === '') {
    return []
  }
  if (beforeText === afterText) {
    return before.map((line) => ({ type: 'unchanged', text: line }))
  }

  const table = lcsTable(before, after)
  const ops = []
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      ops.push({ type: 'unchanged', text: before[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: 'deleted', text: before[i] })
      i += 1
    } else {
      ops.push({ type: 'inserted', text: after[j] })
      j += 1
    }
  }
  while (i < before.length) {
    ops.push({ type: 'deleted', text: before[i] })
    i += 1
  }
  while (j < after.length) {
    ops.push({ type: 'inserted', text: after[j] })
    j += 1
  }
  return ops
}

function extractWikilinkIds(body) {
  const matches = String(body || '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)
  const ids = []
  for (const match of matches) ids.push(match[1].trim())
  return ids
}

function diffFrontmatter(currentFm = {}, proposedFm = {}) {
  const changes = []
  const seen = new Set()
  for (const field of FRONTMATTER_FIELDS) {
    seen.add(field)
    const before = currentFm[field]
    const after = proposedFm[field]
    if (before === undefined && after === undefined) continue
    const beforeIsArray = Array.isArray(before)
    const afterIsArray = Array.isArray(after)
    if (beforeIsArray || afterIsArray) {
      const { added, removed } = diffArrays(asArray(before), asArray(after))
      if (added.length === 0 && removed.length === 0) continue
      changes.push({ field, operation: 'add_to_array', added, removed, before: asArray(before), after: asArray(after) })
      continue
    }
    if (isPrimitiveEqual(before, after)) continue
    const op = before === undefined ? 'add' : (after === undefined ? 'remove' : 'modify')
    changes.push({ field, operation: op, before: before ?? null, after: after ?? null })
  }
  for (const field of Object.keys(proposedFm)) {
    if (seen.has(field)) continue
    if (field === 'id' || field === 'created' || field === 'last_updated' || field === 'schema_version') continue
    if (isPrimitiveEqual(currentFm[field], proposedFm[field])) continue
    changes.push({ field, operation: 'add', before: currentFm[field] ?? null, after: proposedFm[field] ?? null })
  }
  return changes
}

function diffClaims(beforeClaims = [], afterClaims = []) {
  const beforeMap = new Map(beforeClaims.map((claim) => [claim.claim_text, claim]))
  const afterMap = new Map(afterClaims.map((claim) => [claim.claim_text, claim]))
  const additions = []
  const removals = []
  const modifications = []
  for (const [text, claim] of afterMap) {
    if (!beforeMap.has(text)) additions.push(claim)
    else if (JSON.stringify(beforeMap.get(text)) !== JSON.stringify(claim)) {
      modifications.push({ before: beforeMap.get(text), after: claim })
    }
  }
  for (const [text, claim] of beforeMap) {
    if (!afterMap.has(text)) removals.push(claim)
  }
  return { additions, removals, modifications }
}

export class PageDiffer {
  diff(currentPage, proposedFrontmatter, proposedBody) {
    const currentFm = currentPage?.frontmatter || {}
    const currentBody = currentPage?.body || ''
    const isCreation = !currentPage
    const isDeletion = proposedFrontmatter == null && proposedBody == null

    const frontmatter_changes = isDeletion
      ? Object.entries(currentFm).map(([field, before]) => ({ field, operation: 'remove', before, after: null }))
      : diffFrontmatter(currentFm, proposedFrontmatter || {})

    let body_changes
    if (isCreation) {
      body_changes = tokenizeLines(proposedBody).map((text) => ({ type: 'inserted', text }))
    } else if (isDeletion) {
      body_changes = tokenizeLines(currentBody).map((text) => ({ type: 'deleted', text }))
    } else {
      body_changes = lineDiff(currentBody, proposedBody || '')
    }

    const beforeLinks = new Set(extractWikilinkIds(currentBody))
    const afterLinks = new Set(extractWikilinkIds(proposedBody))
    const wikilink_additions = [...afterLinks].filter((id) => !beforeLinks.has(id))
    const wikilink_removals = [...beforeLinks].filter((id) => !afterLinks.has(id))

    const beforeClaims = currentFm.claims || []
    const afterClaims = (proposedFrontmatter && proposedFrontmatter.claims) || []
    const { additions: claim_additions, removals: claim_removals, modifications: claim_modifications } = diffClaims(beforeClaims, afterClaims)

    const totals = {
      lines_added: body_changes.filter((entry) => entry.type === 'inserted').length,
      lines_removed: body_changes.filter((entry) => entry.type === 'deleted').length,
      lines_unchanged: body_changes.filter((entry) => entry.type === 'unchanged').length,
      frontmatter_field_changes: frontmatter_changes.length,
      wikilinks_added: wikilink_additions.length,
      wikilinks_removed: wikilink_removals.length,
    }

    return {
      is_creation: isCreation,
      is_deletion: isDeletion,
      frontmatter_changes,
      body_changes,
      wikilink_additions,
      wikilink_removals,
      claim_additions,
      claim_modifications,
      claim_removals,
      totals,
    }
  }

  diffChange(change, currentPage = null) {
    if (change.operation === 'create' || change.is_creation) {
      return this.diff(null, change.draft_frontmatter || {}, change.draft_body || '')
    }
    if (change.is_deletion) {
      return this.diff(currentPage, null, null)
    }
    return this.diff(currentPage, change.draft_frontmatter || {}, change.draft_body || '')
  }
}

export const __test = { lineDiff, diffFrontmatter, diffClaims, extractWikilinkIds }
