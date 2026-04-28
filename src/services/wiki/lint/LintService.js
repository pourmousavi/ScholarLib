import { WikiPaths } from '../WikiPaths'
import { PageStore } from '../PageStore'
import { readJSONOrNull } from '../WikiStorage'
import { hashMarkdown } from '../WikiHash'
import { parseYamlFence } from '../WikiMarkdown'
import { normalizeAliasKey } from '../SidecarService'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'

export const LINT_RULES = [
  'stale_pages',
  'ingestion_debt',
  'orphan_pages',
  'alias_collisions',
  'broken_wikilinks',
  'contested_claims',
  'stale_position_pages',
  'malformed_op_files',
  'pending_op_recovery_debt',
  'stale_evidence_locators',
]

const DEFAULT_OPTIONS = {
  stale_paper_days: 365,
  stale_concept_days: 180,
  stale_position_days: 90,
  ingestion_debt_threshold: 3,
  pending_op_recovery_minutes: 60,
}

const WIKILINK_RE = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

function parseDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function listWikilinkTargets(body) {
  const matches = String(body || '').matchAll(WIKILINK_RE)
  return [...matches].map((match) => match[1].trim()).filter(Boolean)
}

function listClaimBlocks(body) {
  const text = String(body || '')
  const claims = []
  const opener = '```scholarlib-claim'
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf(opener, cursor)
    if (start === -1) break
    const contentStart = text.indexOf('\n', start)
    if (contentStart === -1) break
    const end = text.indexOf('\n```', contentStart + 1)
    if (end === -1) break
    const yaml = text.slice(contentStart + 1, end)
    let parsed = null
    try {
      parsed = parseYamlFence(text.slice(start, end + 4), 'scholarlib-claim')
    } catch {
      parsed = null
    }
    claims.push({ raw: yaml, parsed: parsed || {} })
    cursor = end + 4
  }
  return claims
}

async function listFilesRecursive(adapter, root) {
  let entries
  try {
    entries = await adapter.listFolder(root)
  } catch (error) {
    if (error?.code === STORAGE_ERRORS.NOT_FOUND) return []
    return []
  }
  const files = []
  for (const entry of entries) {
    const path = `${root}/${entry.name}`
    if (entry.type === 'folder') {
      files.push(...await listFilesRecursive(adapter, path))
    } else {
      files.push({ ...entry, path })
    }
  }
  return files
}

export async function buildWikiSnapshot(adapter) {
  const pages = await PageStore.listPages(adapter)
  const pagesById = new Map(pages.map((page) => [page.id, page]))
  const titlesByKey = new Map()
  for (const page of pages) {
    const key = normalizeAliasKey(page.frontmatter.title || page.id)
    if (key) titlesByKey.set(key, page.id)
    for (const alias of page.frontmatter.aliases || []) {
      const aliasKey = normalizeAliasKey(alias)
      if (aliasKey) titlesByKey.set(aliasKey, page.id)
    }
  }
  const incomingLinks = new Map()
  const outgoingLinks = new Map()
  const unresolvedTargets = new Map()
  for (const page of pages) {
    const targets = listWikilinkTargets(page.body)
    outgoingLinks.set(page.id, targets)
    for (const target of targets) {
      const targetKey = normalizeAliasKey(target)
      const matchedId = pagesById.has(target)
        ? target
        : (titlesByKey.get(targetKey) || null)
      if (matchedId) {
        if (!incomingLinks.has(matchedId)) incomingLinks.set(matchedId, [])
        incomingLinks.get(matchedId).push(page.id)
      } else {
        if (!unresolvedTargets.has(targetKey || target)) {
          unresolvedTargets.set(targetKey || target, { display: target, sources: [] })
        }
        unresolvedTargets.get(targetKey || target).sources.push(page.id)
      }
    }
  }
  const aliasesSidecar = await readJSONOrNull(adapter, WikiPaths.aliasesSidecar)
  return {
    pages,
    pagesById,
    incomingLinks,
    outgoingLinks,
    unresolvedTargets,
    aliasConflicts: (aliasesSidecar?.conflicts || []),
  }
}

function pageType(page) {
  return page.frontmatter?.type || 'paper'
}

function lastModifiedAt(page) {
  return parseDate(page.frontmatter?.updated_at || page.storage?.modified)
}

function finding(rule, message, extras = {}) {
  return {
    rule,
    severity: extras.severity || 'medium',
    page_id: extras.page_id || null,
    message,
    details: extras.details || {},
  }
}

export async function lintStalePages(snapshot, options, now = new Date()) {
  const findings = []
  for (const page of snapshot.pages) {
    const type = pageType(page)
    if (type === 'position_draft' || type === 'position') continue
    const updated = lastModifiedAt(page)
    if (!updated) continue
    const limit = type === 'paper' ? options.stale_paper_days : options.stale_concept_days
    const age = daysBetween(updated, now)
    if (age > limit) {
      findings.push(finding('stale_pages',
        `${type} page "${page.frontmatter.title || page.id}" has not been updated in ${age} days (limit ${limit}).`,
        { page_id: page.id, severity: 'low', details: { age_days: age, limit_days: limit, type } }))
    }
  }
  return findings
}

export async function lintStalePositionPages(snapshot, options, now = new Date()) {
  const findings = []
  for (const page of snapshot.pages) {
    const type = pageType(page)
    if (type !== 'position_draft' && type !== 'position') continue
    const updated = lastModifiedAt(page)
    if (!updated) continue
    const age = daysBetween(updated, now)
    if (age > options.stale_position_days) {
      findings.push(finding('stale_position_pages',
        `Position page "${page.frontmatter.title || page.id}" is ${age} days old (limit ${options.stale_position_days}).`,
        { page_id: page.id, severity: 'medium', details: { age_days: age, limit_days: options.stale_position_days } }))
    }
  }
  return findings
}

export async function lintOrphanPages(snapshot) {
  const findings = []
  for (const page of snapshot.pages) {
    const type = pageType(page)
    if (type === 'paper' || type === 'position_draft' || type === 'position') continue
    const incoming = snapshot.incomingLinks.get(page.id) || []
    if (incoming.length === 0) {
      findings.push(finding('orphan_pages',
        `${type} page "${page.frontmatter.title || page.id}" has no incoming wikilinks.`,
        { page_id: page.id, severity: 'low', details: { type } }))
    }
  }
  return findings
}

export async function lintBrokenWikilinks(snapshot) {
  const findings = []
  for (const [, entry] of snapshot.unresolvedTargets) {
    findings.push(finding('broken_wikilinks',
      `Wikilink target "${entry.display}" cannot be resolved to a page.`,
      { severity: 'medium', details: { target: entry.display, sources: entry.sources } }))
  }
  return findings
}

export async function lintIngestionDebt(snapshot, options) {
  const findings = []
  for (const [key, entry] of snapshot.unresolvedTargets) {
    const sources = new Set(entry.sources)
    if (sources.size >= options.ingestion_debt_threshold) {
      findings.push(finding('ingestion_debt',
        `Concept "${entry.display}" is referenced by ${sources.size} pages but has no concept page.`,
        { severity: 'high', details: { concept: entry.display, source_count: sources.size, key } }))
    }
  }
  return findings
}

export async function lintAliasCollisions(snapshot) {
  const findings = []
  for (const conflict of snapshot.aliasConflicts) {
    findings.push(finding('alias_collisions',
      `Alias "${conflict.alias}" maps to multiple pages: ${(conflict.page_ids || []).join(', ')}.`,
      { severity: 'high', details: conflict }))
  }
  return findings
}

export async function lintContestedClaims(snapshot) {
  const findings = []
  for (const page of snapshot.pages) {
    const claims = listClaimBlocks(page.body)
    for (const claim of claims) {
      const status = String(claim.parsed?.status || '').toLowerCase()
      const hasContradicted = Array.isArray(claim.parsed?.contradicted_by) && claim.parsed.contradicted_by.length > 0
      const hasSupport = Array.isArray(claim.parsed?.supported_by) && claim.parsed.supported_by.length > 0
      if (status === 'contested' || (hasContradicted && hasSupport)) {
        findings.push(finding('contested_claims',
          `Contested claim ${claim.parsed?.id || ''} on "${page.frontmatter.title || page.id}".`,
          { page_id: page.id, severity: 'medium', details: { claim_id: claim.parsed?.id || null, status } }))
      }
    }
  }
  return findings
}

function stripClaimBlocks(body) {
  return String(body || '').replace(/```scholarlib-claim[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

export async function lintStaleEvidenceLocators(snapshot) {
  const findings = []
  for (const page of snapshot.pages) {
    const claims = listClaimBlocks(page.body)
    if (claims.length === 0) continue
    const currentHash = await hashMarkdown(stripClaimBlocks(page.body))
    for (const claim of claims) {
      const stored = claim.parsed?.evidence?.page_text_hash
      if (!stored) continue
      if (stored !== currentHash) {
        findings.push(finding('stale_evidence_locators',
          `Claim ${claim.parsed?.id || ''} on "${page.frontmatter.title || page.id}" has stale page_text_hash.`,
          { page_id: page.id, severity: 'medium', details: { claim_id: claim.parsed?.id || null, stored_hash: stored, current_hash: currentHash } }))
      }
    }
  }
  return findings
}

export async function lintMalformedOpFiles(adapter) {
  const findings = []
  const files = await listFilesRecursive(adapter, WikiPaths.opsRoot)
  for (const file of files.filter((f) => f.path.endsWith('.json'))) {
    try {
      await adapter.readJSON(file.path)
    } catch (error) {
      findings.push(finding('malformed_op_files',
        `Operation file ${file.path} could not be parsed.`,
        { severity: 'high', details: { path: file.path, error: error?.message || 'parse_error' } }))
    }
  }
  return findings
}

export async function lintPendingOpRecoveryDebt(adapter, options, now = new Date()) {
  const findings = []
  const files = await listFilesRecursive(adapter, WikiPaths.opsRoot)
  for (const file of files.filter((f) => f.path.endsWith('.pending.json'))) {
    let op
    try {
      op = await adapter.readJSON(file.path)
    } catch {
      continue
    }
    const created = parseDate(op?.created_at)
    if (!created) continue
    const ageMinutes = (now.getTime() - created.getTime()) / 60000
    if (ageMinutes >= options.pending_op_recovery_minutes) {
      findings.push(finding('pending_op_recovery_debt',
        `Pending operation ${op?.id || file.path} is ${Math.round(ageMinutes)} minutes old.`,
        { severity: 'high', details: { operation_id: op?.id || null, path: file.path, age_minutes: Math.round(ageMinutes) } }))
    }
  }
  return findings
}

function buildMarkdownReport({ findings, generated_at, summary }) {
  const lines = []
  lines.push(`# Wiki Lint Report — ${generated_at.slice(0, 10)}`)
  lines.push('')
  lines.push(`Generated at: ${generated_at}`)
  lines.push('')
  lines.push('## Summary')
  if (Object.keys(summary.by_rule).length === 0) {
    lines.push('_No findings._')
  } else {
    for (const rule of LINT_RULES) {
      const count = summary.by_rule[rule] || 0
      if (count > 0) lines.push(`- **${rule}**: ${count}`)
    }
  }
  lines.push('')
  lines.push('## Findings')
  if (findings.length === 0) {
    lines.push('_None._')
  } else {
    const grouped = {}
    for (const finding of findings) {
      if (!grouped[finding.rule]) grouped[finding.rule] = []
      grouped[finding.rule].push(finding)
    }
    for (const rule of LINT_RULES) {
      const list = grouped[rule]
      if (!list || list.length === 0) continue
      lines.push(`### ${rule}`)
      for (const f of list) {
        const id = f.page_id ? ` _(${f.page_id})_` : ''
        lines.push(`- [${f.severity}] ${f.message}${id}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

export class LintService {
  constructor({ adapter, options = {}, now = () => new Date() } = {}) {
    if (!adapter) throw new Error('LintService requires a storage adapter')
    this.adapter = adapter
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.now = now
  }

  async runAll({ rules = LINT_RULES } = {}) {
    const snapshot = await buildWikiSnapshot(this.adapter)
    const now = this.now()
    const findings = []
    if (rules.includes('stale_pages')) findings.push(...await lintStalePages(snapshot, this.options, now))
    if (rules.includes('stale_position_pages')) findings.push(...await lintStalePositionPages(snapshot, this.options, now))
    if (rules.includes('orphan_pages')) findings.push(...await lintOrphanPages(snapshot))
    if (rules.includes('broken_wikilinks')) findings.push(...await lintBrokenWikilinks(snapshot))
    if (rules.includes('ingestion_debt')) findings.push(...await lintIngestionDebt(snapshot, this.options))
    if (rules.includes('alias_collisions')) findings.push(...await lintAliasCollisions(snapshot))
    if (rules.includes('contested_claims')) findings.push(...await lintContestedClaims(snapshot))
    if (rules.includes('stale_evidence_locators')) findings.push(...await lintStaleEvidenceLocators(snapshot))
    if (rules.includes('malformed_op_files')) findings.push(...await lintMalformedOpFiles(this.adapter))
    if (rules.includes('pending_op_recovery_debt')) findings.push(...await lintPendingOpRecoveryDebt(this.adapter, this.options, now))

    const summary = { total: findings.length, by_rule: {}, by_severity: { high: 0, medium: 0, low: 0 } }
    for (const finding of findings) {
      summary.by_rule[finding.rule] = (summary.by_rule[finding.rule] || 0) + 1
      summary.by_severity[finding.severity] = (summary.by_severity[finding.severity] || 0) + 1
    }
    return {
      findings,
      summary,
      generated_at: now.toISOString(),
    }
  }

  async runAndPersist({ rules, dateLabel } = {}) {
    const result = await this.runAll({ rules })
    const date = (dateLabel || result.generated_at).slice(0, 10)
    const markdown = buildMarkdownReport({
      findings: result.findings,
      summary: result.summary,
      generated_at: result.generated_at,
    })
    await this.adapter.createFolder(WikiPaths.lintReportsRoot)
    let expectedRevision = null
    try {
      expectedRevision = (await this.adapter.getMetadata(WikiPaths.lintReport(date))).revision
    } catch (error) {
      if (error?.code !== STORAGE_ERRORS.NOT_FOUND) throw error
    }
    await this.adapter.writeTextIfRevision(WikiPaths.lintReport(date), markdown, expectedRevision)
    return { ...result, markdown, path: WikiPaths.lintReport(date) }
  }
}

export const LINT_DEFAULT_OPTIONS = DEFAULT_OPTIONS
export { buildMarkdownReport as buildLintMarkdownReport }
