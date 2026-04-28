import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull } from '../WikiStorage'
import { parseWikiMarkdown } from '../WikiMarkdown'
import { STORAGE_ERRORS } from '../../storage/StorageAdapter'
import { aggregateMetrics, summariseCosts, PHASE3_QUALITY_THRESHOLDS } from '../phase1/QualityMetrics'

const WELL_SUPPORTED_PAPER_THRESHOLD = 3

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

async function readPageBody(adapter, path) {
  if (!adapter || !path) return ''
  try {
    const { text } = await adapter.readTextWithMetadata(path)
    return parseWikiMarkdown(text).body || ''
  } catch (error) {
    if (error.code === STORAGE_ERRORS.NOT_FOUND) return ''
    throw error
  }
}

function countClaims(body) {
  return (String(body || '').match(/```scholarlib-claim/g) || []).length
}

function listSupportedPaperIds(body) {
  const matches = String(body || '').match(/p_[0-9A-HJKMNP-TV-Z]{10,}/gi) || []
  return Array.from(new Set(matches))
}

export async function computePerThemeCoverage(plan, adapter) {
  const themes = (plan?.themes || []).slice()
  if (themes.length === 0) return []

  const sidecar = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
  const pages = sidecar?.pages || []
  const conceptPages = pages.filter((page) => String(page.id || '').startsWith('c_'))
  const conceptDetails = []
  for (const page of conceptPages) {
    const body = await readPageBody(adapter, page.path)
    conceptDetails.push({
      id: page.id,
      title: page.title || page.id,
      supporting_paper_ids: listSupportedPaperIds(body),
      claims: countClaims(body),
    })
  }

  const allEntries = [...(plan?.own_papers || []), ...(plan?.external_anchors || [])]
  const ingestedByTheme = new Map()
  for (const entry of allEntries) {
    if (!entry.theme || entry.status !== 'ingested') continue
    if (!ingestedByTheme.has(entry.theme)) ingestedByTheme.set(entry.theme, new Set())
    if (entry.paper_page_id) ingestedByTheme.get(entry.theme).add(entry.paper_page_id)
  }

  return themes.map((theme) => {
    const ingestedPaperIds = ingestedByTheme.get(theme) || new Set()
    const themeConceptPages = conceptDetails.filter((concept) =>
      concept.supporting_paper_ids.some((id) => ingestedPaperIds.has(id))
    )
    const wellSupported = themeConceptPages.filter((concept) =>
      concept.supporting_paper_ids.length >= WELL_SUPPORTED_PAPER_THRESHOLD
    )
    return {
      theme,
      papers_ingested: ingestedPaperIds.size,
      concept_pages: themeConceptPages.length,
      well_supported_concept_pages: wellSupported.length,
    }
  })
}

export async function computeCrossPaperCoherence(adapter, { topN = 10 } = {}) {
  const sidecar = await readJSONOrNull(adapter, WikiPaths.pagesSidecar)
  const pages = sidecar?.pages || []
  const concepts = pages.filter((page) => String(page.id || '').startsWith('c_'))
  const enriched = []
  for (const page of concepts) {
    const body = await readPageBody(adapter, page.path)
    enriched.push({
      page_id: page.id,
      title: page.title || page.id,
      supporting_paper_ids: listSupportedPaperIds(body),
      claims_count: countClaims(body),
    })
  }
  const topConcepts = enriched
    .sort((a, b) => b.supporting_paper_ids.length - a.supporting_paper_ids.length)
    .slice(0, topN)

  if (topConcepts.length === 0) {
    return { entries: [], stddev_claim_count: 0, average_supporting_papers: 0 }
  }

  const avgSupporting = topConcepts.reduce((sum, entry) => sum + entry.supporting_paper_ids.length, 0) / topConcepts.length
  const claimCounts = topConcepts.map((entry) => entry.claims_count)
  const meanClaims = claimCounts.reduce((sum, value) => sum + value, 0) / claimCounts.length
  const variance = claimCounts.reduce((sum, value) => sum + Math.pow(value - meanClaims, 2), 0) / claimCounts.length
  const stddev = Math.sqrt(variance)
  return {
    entries: topConcepts.map((entry) => ({
      page_id: entry.page_id,
      title: entry.title,
      supporting_papers: entry.supporting_paper_ids.length,
      claims_count: entry.claims_count,
    })),
    stddev_claim_count: stddev,
    average_supporting_papers: avgSupporting,
  }
}

export function computeBootstrapProgress(plan) {
  const summarise = (entries = []) => ({
    total: entries.length,
    queued: entries.filter((entry) => entry.status === 'queued').length,
    in_progress: entries.filter((entry) => entry.status === 'in_progress').length,
    ingested: entries.filter((entry) => entry.status === 'ingested').length,
    deferred: entries.filter((entry) => entry.status === 'deferred').length,
  })
  return {
    own_papers: summarise(plan?.own_papers),
    external_anchors: summarise(plan?.external_anchors),
    targets: plan?.targets || { own_papers: { min: 25, max: 30 }, external_anchors: { min: 10, max: 15 } },
  }
}

export function computeCostProjection(checklists = [], plan) {
  const cost = summariseCosts(checklists)
  const completedCount = checklists.length
  const averageCostPerPaper = completedCount === 0 ? 0 : cost.total / completedCount

  const ownTotal = plan?.own_papers?.length || 0
  const anchorsTotal = plan?.external_anchors?.length || 0
  const ownIngested = (plan?.own_papers || []).filter((entry) => entry.status === 'ingested').length
  const anchorsIngested = (plan?.external_anchors || []).filter((entry) => entry.status === 'ingested').length
  const remaining = (ownTotal - ownIngested) + (anchorsTotal - anchorsIngested)
  const projectedRemaining = remaining * averageCostPerPaper

  const phase3LowerBound = 5
  const phase3UpperBound = 15
  const projectedTotal = cost.total + projectedRemaining

  return {
    spent_usd: cost.total,
    average_per_paper_usd: averageCostPerPaper,
    remaining_papers: Math.max(0, remaining),
    projected_remaining_usd: projectedRemaining,
    projected_total_usd: projectedTotal,
    projection_lower_bound_usd: phase3LowerBound,
    projection_upper_bound_usd: phase3UpperBound,
    over_budget: projectedTotal > phase3UpperBound,
  }
}

export function aggregatePhase3Metrics({
  checklists = [],
  usefulnessRatings = [],
  schemaMigrations = [],
  manualCleanupCount = 0,
  trendWindow = 10,
} = {}) {
  return aggregateMetrics({
    checklists,
    usefulnessRatings,
    schemaMigrations,
    manualCleanupCount,
    trendWindow,
    thresholds: PHASE3_QUALITY_THRESHOLDS,
  })
}

export const PHASE3_PROGRESS_THRESHOLD = WELL_SUPPORTED_PAPER_THRESHOLD
