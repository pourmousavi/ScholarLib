import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStorageStore } from '../../store/storageStore'
import {
  ProposalStore,
  WikiService,
  CostEstimator,
  ReviewDebtCalculator,
} from '../../services/wiki'
import { OperationLogService } from '../../services/wiki/OperationLogService'
import { IntegrityService } from '../../services/wiki/IntegrityService'
import { SidecarService } from '../../services/wiki/SidecarService'
import { WikiStateService } from '../../services/wiki/WikiStateService'
import { PageStore } from '../../services/wiki/PageStore'
import ProposalReview from './ProposalReview'
import LintReportView from './lint/LintReportView'
import RecoveryActions from './recovery/RecoveryActions'
import AliasCollisionRecovery from './recovery/AliasCollisionRecovery'
import styles from './Wiki.module.css'

const STALE_REVIEW_DAYS = 90

function tierTotalsOf(proposal) {
  const counts = { low: 0, medium: 0, high: 0 }
  for (const change of proposal.page_changes || []) {
    const tier = change.risk_tier || 'low'
    if (counts[tier] != null) counts[tier] += 1
  }
  return counts
}

function ageMinutes(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round(ms / 60000))
}

function formatAge(minutes) {
  if (minutes == null) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function isStalePage(page) {
  const reference = page.frontmatter?.last_human_review || page.frontmatter?.last_updated || page.frontmatter?.updated_at
  if (!reference) return false
  const ms = Date.now() - new Date(reference).getTime()
  if (!Number.isFinite(ms)) return false
  return ms / (24 * 60 * 60 * 1000) > STALE_REVIEW_DAYS
}

function isPositionStale(page) {
  if (page.frontmatter?.type !== 'position_draft') return false
  return isStalePage(page)
}

function findingsFromState(state, pendingOps, integrityCheck) {
  const findings = []
  if (state?.safety_mode) {
    findings.push({
      id: 'safety_mode',
      severity: 'error',
      code: 'WIKI_SAFETY_MODE',
      message: state.safety_reason || 'Wiki entered safety mode',
    })
  }
  for (const issue of integrityCheck?.issues || []) {
    findings.push({
      id: `integrity_${issue.code}_${issue.page_id || ''}`,
      severity: issue.severity || 'warning',
      code: issue.code,
      page_id: issue.page_id,
      message: issue.message || null,
      auto_fixable: issue.severity === 'warning',
    })
  }
  for (const op of pendingOps || []) {
    findings.push({
      id: `pending_op_${op.id}`,
      severity: 'warning',
      code: 'PENDING_OP_ORPHAN',
      message: `Pending operation ${op.id} (${op.type}) has not been committed`,
      proposed_fix: 'Run wiki recovery to commit or archive this operation.',
    })
  }
  return findings
}

export default function Inbox() {
  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)
  const [proposals, setProposals] = useState([])
  const [status, setStatus] = useState(null)
  const [cost, setCost] = useState(null)
  const [reviewDebt, setReviewDebt] = useState(null)
  const [stalePages, setStalePages] = useState({ knowledge: [], position: [] })
  const [pendingOps, setPendingOps] = useState([])
  const [integrityCheck, setIntegrityCheck] = useState(null)
  const [selected, setSelected] = useState(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [filter, setFilter] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const proposalRefs = useRef({})

  const load = useCallback(async () => {
    if (!adapter || isDemoMode) return
    setLoading(true)
    setLoadError(null)
    try {
      const proposalStore = new ProposalStore(adapter)
      const [
        list,
        nextStatus,
        nextCost,
        nextReviewDebt,
        nextPendingOps,
        pages,
      ] = await Promise.all([
        proposalStore.listPending(),
        WikiService.getStatus(adapter),
        new CostEstimator({ adapter }).getRunningCost().catch(() => null),
        new ReviewDebtCalculator({ adapter, proposalStore }).computeDebt().catch(() => null),
        OperationLogService.listPending(adapter).catch(() => []),
        PageStore.listPageSummaries(adapter).catch(() => []),
      ])
      setProposals(list)
      setStatus(nextStatus)
      setCost(nextCost)
      setReviewDebt(nextReviewDebt)
      setPendingOps(nextPendingOps)
      setIntegrityCheck(nextStatus?.state?.last_integrity_check || null)
      setStalePages({
        knowledge: pages.filter((page) => page.frontmatter?.type !== 'position_draft' && isStalePage(page)),
        position: pages.filter((page) => isPositionStale(page)),
      })
    } catch (error) {
      setLoadError(error.message || 'Failed to load wiki inbox')
    } finally {
      setLoading(false)
    }
  }, [adapter, isDemoMode])

  useEffect(() => { load() }, [load, refreshNonce])

  useEffect(() => {
    function onKey(event) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (selected) return
      if (proposals.length === 0) return
      const ids = proposals.map((proposal) => proposal.proposal_id)
      const focused = document.activeElement?.dataset?.proposalId
      const index = focused ? ids.indexOf(focused) : -1
      if (event.key === 'j') {
        event.preventDefault()
        const next = ids[Math.min(ids.length - 1, index + 1)] || ids[0]
        proposalRefs.current[next]?.focus()
      } else if (event.key === 'k') {
        event.preventDefault()
        const prev = ids[Math.max(0, index - 1)] || ids[0]
        proposalRefs.current[prev]?.focus()
      } else if (event.key === 'Enter' && focused) {
        event.preventDefault()
        const proposal = proposals.find((entry) => entry.proposal_id === focused)
        if (proposal) setSelected(proposal)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [proposals, selected])

  const summary = useMemo(() => {
    if (!proposals) return null
    const tiered = proposals.reduce((acc, proposal) => {
      const totals = tierTotalsOf(proposal)
      acc.high += totals.high; acc.medium += totals.medium; acc.low += totals.low
      return acc
    }, { high: 0, medium: 0, low: 0 })
    return { tiered, count: proposals.length }
  }, [proposals])

  const lintFindings = useMemo(() => findingsFromState(status?.state, pendingOps, integrityCheck), [status, pendingOps, integrityCheck])

  if (!adapter || isDemoMode) {
    return (
      <div className={styles.inbox}>
        <h2>Wiki</h2>
        <p>Wiki requires connected storage.</p>
      </div>
    )
  }

  if (selected) {
    return (
      <ProposalReview
        proposal={selected}
        adapter={adapter}
        onClose={() => setSelected(null)}
        onApplied={() => {
          setSelected(null)
          setRefreshNonce((n) => n + 1)
        }}
      />
    )
  }

  const safetyMode = Boolean(status?.state?.safety_mode)
  const debtMinutes = reviewDebt?.total_minutes ?? 0
  const isPaused = reviewDebt?.paused === true

  const handleApplyFix = async (finding) => {
    try {
      if (finding.code === 'PENDING_OP_ORPHAN') {
        await WikiService.recover(adapter)
      } else if (finding.code === 'PAGE_MISSING_FROM_SIDECAR' || finding.code === 'PAGE_REVISION_MISMATCH' || finding.code === 'SIDECAR_PAGE_NOT_FOUND') {
        await WikiService.regenerateSidecars(adapter)
      }
      const fresh = await IntegrityService.check(adapter)
      setIntegrityCheck(fresh)
    } catch (error) {
      console.error('Wiki apply-fix failed:', error)
      window.alert?.(`Apply fix failed: ${error?.message || error}`)
    }
    setRefreshNonce((n) => n + 1)
  }

  const handleApplyAllFixes = async (findings) => {
    try {
      if (findings.some((entry) => entry.code === 'PENDING_OP_ORPHAN')) await WikiService.recover(adapter)
      if (findings.some((entry) => entry.code?.startsWith('PAGE_') || entry.code?.startsWith('SIDECAR_'))) {
        await WikiService.regenerateSidecars(adapter)
      }
      const fresh = await IntegrityService.check(adapter)
      setIntegrityCheck(fresh)
    } catch (error) {
      console.error('Wiki apply-all-fixes failed:', error)
      window.alert?.(`Apply all fixes failed: ${error?.message || error}`)
    }
    setRefreshNonce((n) => n + 1)
  }

  const handleIntegrityCheck = async () => {
    const result = await IntegrityService.check(adapter)
    setIntegrityCheck(result)
    return result
  }

  const handleAcceptOverwrite = async () => {
    const result = await SidecarService.regenerate(adapter)
    await WikiStateService.save(adapter, { safety_mode: false, safety_reason: null })
    setRefreshNonce((n) => n + 1)
    return { regenerated: true, page_count: result.pages.count }
  }

  const handleRestoreLatest = async () => {
    const recovered = await WikiService.recover(adapter)
    setRefreshNonce((n) => n + 1)
    return { recovered }
  }

  return (
    <div className={styles.inbox}>
      <header className={styles.inboxHeader}>
        <div>
          <h2>Wiki</h2>
          <p>
            <span className={`${styles.stateBadge} ${safetyMode ? styles.stateBadgeSafety : styles.stateBadgeNormal}`}>
              {safetyMode ? 'Safety mode' : 'Normal'}
            </span>
            <button type="button" className={styles.inboxStatChip} onClick={() => setFilter('proposals')}>
              {loading && proposals.length === 0 ? '...' : summary?.count || 0} proposal{summary?.count === 1 ? '' : 's'}
            </button>
            <button type="button" className={styles.inboxStatChip} onClick={() => setFilter('lint')}>
              {loading && !status ? '...' : lintFindings.length} lint
            </button>
            <button type="button" className={styles.inboxStatChip} onClick={() => setFilter('stale')}>
              {loading && (stalePages.knowledge.length + stalePages.position.length) === 0 ? '...' : stalePages.knowledge.length + stalePages.position.length} stale
            </button>
            <button type="button" className={styles.inboxStatChip} onClick={() => setFilter('recovery')}>
              {loading && pendingOps.length === 0 ? '...' : pendingOps.length} pending op{pendingOps.length === 1 ? '' : 's'}
            </button>
          </p>
          {cost && (
            <p className={styles.inboxCost}>
              <small>This month: ${Number(cost.used_usd || 0).toFixed(2)} / ${Number(cost.monthly_cap_usd || 0).toFixed(0)} cap</small>
            </p>
          )}
        </div>
        <div className={styles.inboxHeaderActions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setRefreshNonce((n) => n + 1)} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      {loadError && <div className={styles.empty}>{loadError}</div>}
      {loading && proposals.length === 0 && <div className={styles.empty}>Loading wiki inbox...</div>}

      {isPaused && (
        <div role="alert" className={styles.reviewDebtBanner}>
          <strong>Review queue is full</strong>
          <p>
            Pending review debt is {debtMinutes.toFixed(1)} minutes (threshold {reviewDebt?.threshold_minutes} min).
            New ingestion is auto-paused. Clear pending proposals first, or use the manual override.
          </p>
        </div>
      )}

      <section className={styles.inboxSection} aria-label="Pending proposals" id="inbox-proposals">
        <header className={styles.inboxSectionHeader}>
          <h3>Pending proposals</h3>
          {summary?.tiered && (
            <p className={styles.inboxSectionMeta}>
              {summary.tiered.high} high · {summary.tiered.medium} medium · {summary.tiered.low} low across {summary.count}
            </p>
          )}
        </header>
        {proposals.length === 0 ? (
          <div className={styles.inboxEmptyState}>
            <strong>Wiki is up to date</strong>
            <p>No pending proposals. New ingestions will appear here.</p>
          </div>
        ) : (
          <ul className={styles.proposalCardList}>
            {proposals.map((proposal) => {
              const totals = tierTotalsOf(proposal)
              const minutes = ageMinutes(proposal.created_at)
              return (
                <li key={proposal.proposal_id}>
                  <button
                    type="button"
                    ref={(node) => { proposalRefs.current[proposal.proposal_id] = node }}
                    data-proposal-id={proposal.proposal_id}
                    className={styles.proposalCard}
                    onClick={() => setSelected(proposal)}
                  >
                    <div className={styles.proposalCardMain}>
                      <strong>{proposal.source?.title || proposal.proposal_id}</strong>
                      <small>{proposal.source?.doi || proposal.source?.scholarlib_doc_id || ''}</small>
                    </div>
                    <div className={styles.proposalCardTiers}>
                      <span className={`${styles.tier} ${styles.high}`}>{totals.high}H</span>
                      <span className={`${styles.tier} ${styles.medium}`}>{totals.medium}M</span>
                      <span className={`${styles.tier} ${styles.low}`}>{totals.low}L</span>
                      <span className={styles.proposalAge}>{formatAge(minutes)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {(filter === 'lint' || lintFindings.length > 0) && (
        <LintReportView
          findings={lintFindings}
          onApplyFix={handleApplyFix}
          onApplyAll={handleApplyAllFixes}
          onDismiss={() => setIntegrityCheck(null)}
        />
      )}

      <RecoveryActions
        state={status?.state}
        onRunIntegrityCheck={handleIntegrityCheck}
        onAcceptOverwrite={safetyMode ? handleAcceptOverwrite : null}
        onRestoreLatest={pendingOps.length > 0 ? handleRestoreLatest : null}
      />

      {safetyMode && (
        <AliasCollisionRecovery
          adapter={adapter}
          onResolved={() => setRefreshNonce((n) => n + 1)}
        />
      )}

      <section className={styles.inboxSection} aria-label="Stale flags">
        <header className={styles.inboxSectionHeader}>
          <h3>Stale flags</h3>
          <p className={styles.inboxSectionMeta}>Pages older than {STALE_REVIEW_DAYS} days without review</p>
        </header>
        {(stalePages.knowledge.length + stalePages.position.length) === 0 ? (
          <p className={styles.empty}>No stale pages.</p>
        ) : (
          <ul className={styles.staleList}>
            {[...stalePages.position.map((page) => ({ ...page, kind: 'position' })), ...stalePages.knowledge.map((page) => ({ ...page, kind: 'knowledge' }))].map((page) => (
              <li key={page.id}>
                <strong>{page.frontmatter?.title || page.id}</strong>
                <small>{page.kind === 'position' ? 'position draft' : page.frontmatter?.type || 'page'} · last reviewed {page.frontmatter?.last_human_review || page.frontmatter?.last_updated || 'unknown'}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.inboxSection} aria-label="Chat candidates">
        <header className={styles.inboxSectionHeader}>
          <h3>Chat candidates</h3>
          <p className={styles.inboxSectionMeta}>Surface activates in Phase 5</p>
        </header>
        <p className={styles.empty}>No chat candidates yet.</p>
      </section>
    </div>
  )
}
