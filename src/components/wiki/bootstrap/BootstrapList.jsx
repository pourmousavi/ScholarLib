import { useEffect, useMemo, useState } from 'react'
import {
  BOOTSTRAP_SECTIONS,
  createEmptyPlan,
} from '../../../services/wiki/bootstrap/BootstrapPlanService'
import styles from '../Wiki.module.css'

const SECTION_LABELS = {
  own_papers: 'My papers',
  external_anchors: 'External anchors',
}

const STATUS_LABELS = {
  queued: 'Queued',
  in_progress: 'In progress',
  ingested: 'Ingested',
  deferred: 'Deferred',
}

function PaperRow({ entry, section, library, canIngest, onRemove, onMoveUp, onMoveDown, onSetStatus }) {
  const doc = library?.documents?.[entry.scholarlib_doc_id]
  const title = doc?.metadata?.title || entry.scholarlib_doc_id
  const allowMove = entry.status !== 'ingested'
  return (
    <li className={`${styles.bootstrapRow} ${styles[`status_${entry.status}`] || ''}`} aria-label={`bootstrap-${section}-${entry.scholarlib_doc_id}`}>
      <div className={styles.bootstrapRowMain}>
        <div className={styles.bootstrapRowTitle}>
          <span className={styles.bootstrapOrder} aria-label={`order ${entry.order}`}>#{entry.order}</span>
          <strong>{title}</strong>
        </div>
        <div className={styles.bootstrapRowMeta}>
          <span>Theme: {entry.theme || '—'}</span>
          <span>Status: {STATUS_LABELS[entry.status] || entry.status}</span>
          {section === 'external_anchors' && entry.why_anchor && (
            <span title={entry.why_anchor}>Anchor reason: {entry.why_anchor.slice(0, 60)}{entry.why_anchor.length > 60 ? '…' : ''}</span>
          )}
        </div>
      </div>
      <div className={styles.bootstrapRowActions}>
        <button type="button" className={styles.iconBtn} onClick={() => onMoveUp(entry)} disabled={!allowMove} aria-label="move up">↑</button>
        <button type="button" className={styles.iconBtn} onClick={() => onMoveDown(entry)} disabled={!allowMove} aria-label="move down">↓</button>
        <select
          aria-label={`status for ${entry.scholarlib_doc_id}`}
          value={entry.status}
          onChange={(event) => onSetStatus(entry, event.target.value)}
          disabled={section === 'external_anchors' && !canIngest && entry.status === 'queued'}
        >
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button type="button" className={styles.dangerBtn} onClick={() => onRemove(entry)} aria-label="remove">Remove</button>
      </div>
    </li>
  )
}

function AddPaperDialog({ section, library, themes, existingIds, onAdd, onClose }) {
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState(themes[0] || '')
  const [newTheme, setNewTheme] = useState('')
  const [whyAnchor, setWhyAnchor] = useState('')
  const [notes, setNotes] = useState('')
  const matches = useMemo(() => {
    const list = Object.values(library?.documents || {})
    const lower = query.toLowerCase().trim()
    return list
      .filter((doc) => !existingIds.has(doc.id))
      .filter((doc) => {
        if (!lower) return true
        const haystack = `${doc.metadata?.title || ''} ${doc.metadata?.authors?.join(' ') || ''}`.toLowerCase()
        return haystack.includes(lower)
      })
      .slice(0, 25)
  }, [library, query, existingIds])

  return (
    <div className={styles.bootstrapDialogBackdrop} role="dialog" aria-label="add paper to bootstrap">
      <div className={styles.bootstrapDialog}>
        <header>
          <h3>Add to {SECTION_LABELS[section]}</h3>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="close">×</button>
        </header>
        <label>
          Search library
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or author"
            aria-label="search library"
          />
        </label>
        <label>
          Theme (existing)
          <select value={theme} onChange={(event) => setTheme(event.target.value)} aria-label="theme">
            <option value="">— choose —</option>
            {themes.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          Theme (new)
          <input
            type="text"
            value={newTheme}
            onChange={(event) => setNewTheme(event.target.value)}
            placeholder="e.g. calendar aging"
            aria-label="new theme"
          />
        </label>
        {section === 'external_anchors' && (
          <label>
            Why is this an anchor?
            <textarea
              value={whyAnchor}
              onChange={(event) => setWhyAnchor(event.target.value)}
              aria-label="why anchor"
            />
          </label>
        )}
        <label>
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-label="notes"
          />
        </label>
        <ul className={styles.bootstrapMatchList}>
          {matches.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => {
                  const finalTheme = (newTheme || theme).trim()
                  if (!finalTheme) return
                  onAdd({
                    section,
                    scholarlibDocId: doc.id,
                    theme: finalTheme,
                    notes,
                    why_anchor: whyAnchor,
                  })
                }}
              >
                {doc.metadata?.title || doc.id}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className={styles.empty}>No matching papers.</li>}
        </ul>
      </div>
    </div>
  )
}

function ProgressBar({ status }) {
  const { own_papers, external_anchors, targets } = status
  const ownTotal = targets.own_papers.max
  const externalTotal = targets.external_anchors.max
  return (
    <div className={styles.bootstrapProgress}>
      <div>
        <strong>{own_papers.ingested}</strong> of {ownTotal} own-papers ingested
        <span className={styles.bootstrapProgressDetail}>
          (queued {own_papers.queued}, in progress {own_papers.in_progress}, deferred {own_papers.deferred})
        </span>
      </div>
      <div>
        <strong>{external_anchors.ingested}</strong> of {externalTotal} external anchors ingested
        <span className={styles.bootstrapProgressDetail}>
          (queued {external_anchors.queued}, in progress {external_anchors.in_progress}, deferred {external_anchors.deferred})
        </span>
      </div>
    </div>
  )
}

export default function BootstrapList({
  service,
  library = { documents: {} },
  initialPlan,
  onPlanChange,
}) {
  const [plan, setPlan] = useState(initialPlan || createEmptyPlan())
  const [loading, setLoading] = useState(!initialPlan && Boolean(service))
  const [dialogSection, setDialogSection] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!service || initialPlan) return undefined
    service
      .loadPlan()
      .then((next) => {
        if (cancelled) return
        setPlan(next)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Failed to load plan')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [service, initialPlan])

  const refresh = async (next) => {
    setPlan(next)
    onPlanChange?.(next)
  }

  const status = useMemo(() => {
    const summarise = (entries) => {
      const summary = { total: entries.length, queued: 0, in_progress: 0, ingested: 0, deferred: 0 }
      for (const entry of entries) {
        const key = entry.status || 'queued'
        if (summary[key] !== undefined) summary[key] += 1
      }
      return summary
    }
    return {
      own_papers: summarise(plan.own_papers),
      external_anchors: summarise(plan.external_anchors),
      themes: plan.themes,
      targets: plan.targets,
    }
  }, [plan])

  const externalAllowed = useMemo(() => {
    if (plan.own_papers.length === 0) return false
    return plan.own_papers.every((entry) => entry.status === 'ingested' || entry.status === 'deferred')
  }, [plan])

  const handleAdd = async (payload) => {
    if (!service) return
    try {
      const next = await service.addPaper(payload.section, payload.scholarlibDocId, payload.theme, payload)
      await refresh(next)
      setDialogSection(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (section, entry) => {
    if (!service) return
    const next = await service.removePaper(section, entry.scholarlib_doc_id)
    await refresh(next)
  }

  const handleMove = async (section, entry, delta) => {
    if (!service) return
    const next = await service.reorder(section, entry.scholarlib_doc_id, (entry.order || 1) + delta)
    await refresh(next)
  }

  const handleSetStatus = async (section, entry, status) => {
    if (!service) return
    const next = await service.setStatus(section, entry.scholarlib_doc_id, status)
    await refresh(next)
  }

  if (loading) return <div className={styles.bootstrap}>Loading bootstrap plan…</div>

  return (
    <div className={styles.bootstrap}>
      <header className={styles.bootstrapHeader}>
        <div>
          <h2>Phase 3 controlled bootstrap</h2>
          <p>Manually curated, ordered, and reviewed paper-by-paper.</p>
        </div>
        <ProgressBar status={status} />
      </header>

      {error && <div role="alert" className={styles.bootstrapError}>{error}</div>}
      {!externalAllowed && status.external_anchors.total > 0 && (
        <div className={styles.bootstrapNotice} role="status">
          External anchors are gated until every own-paper is ingested or marked deferred.
        </div>
      )}

      <div className={styles.bootstrapColumns}>
        {BOOTSTRAP_SECTIONS.map((section) => (
          <section key={section} className={styles.bootstrapColumn} aria-label={SECTION_LABELS[section]}>
            <header>
              <h3>{SECTION_LABELS[section]}</h3>
              <button type="button" className={styles.secondaryBtn} onClick={() => setDialogSection(section)}>
                Add paper
              </button>
            </header>
            <ul className={styles.bootstrapEntries}>
              {plan[section].length === 0 && (
                <li className={styles.empty}>No papers added yet.</li>
              )}
              {plan[section].map((entry) => (
                <PaperRow
                  key={entry.scholarlib_doc_id}
                  entry={entry}
                  section={section}
                  library={library}
                  canIngest={section !== 'external_anchors' || externalAllowed}
                  onRemove={(target) => handleRemove(section, target)}
                  onMoveUp={(target) => handleMove(section, target, -1)}
                  onMoveDown={(target) => handleMove(section, target, +1)}
                  onSetStatus={(target, status) => handleSetStatus(section, target, status)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {dialogSection && (
        <AddPaperDialog
          section={dialogSection}
          library={library}
          themes={plan.themes}
          existingIds={new Set([
            ...plan.own_papers.map((entry) => entry.scholarlib_doc_id),
            ...plan.external_anchors.map((entry) => entry.scholarlib_doc_id),
          ])}
          onAdd={handleAdd}
          onClose={() => setDialogSection(null)}
        />
      )}
    </div>
  )
}
