import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../../../store/libraryStore'
import { useUIStore } from '../../../store/uiStore'
import { useToast } from '../../../hooks/useToast'
import { PageStore } from '../../../services/wiki/PageStore'
import { GrantIngestion } from '../../../services/wiki/grants/GrantIngestion'
import { getUningestedGrantDocuments } from '../../../services/wiki/grants/GrantLibraryClassifier'
import GrantOutcomeForm from './GrantOutcomeForm'
import wikiStyles from '../Wiki.module.css'
import styles from './GrantPanel.module.css'

const OUTCOMES = ['pending', 'under_review', 'won', 'rejected', 'withdrawn', 'other']

export default function GrantPanel({ adapter }) {
  const [grants, setGrants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [activeOutcome, setActiveOutcome] = useState('pending')
  const [showArchived, setShowArchived] = useState(false)
  const [ingestingDocId, setIngestingDocId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const documents = useLibraryStore((s) => s.documents)
  const folders = useLibraryStore((s) => s.folders)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const targetedGrantId = useUIStore((s) => s.wikiSelectedGrantPageId)
  const setTargetedGrantId = useUIStore((s) => s.setWikiSelectedGrantPageId)
  const { showToast } = useToast()

  const library = useMemo(() => ({ documents, folders }), [documents, folders])

  const loadGrants = useCallback(async () => {
    if (!adapter) return []
    setLoading(true)
    setLoadError(null)
    try {
      const next = (await PageStore.listPagesByType(adapter, 'grant'))
        .sort((a, b) => String(a.frontmatter?.title || a.id).localeCompare(String(b.frontmatter?.title || b.id)))
      setGrants(next)
      return next
    } catch (error) {
      setLoadError(error.message || 'Failed to load grants')
      return []
    } finally {
      setLoading(false)
    }
  }, [adapter])

  useEffect(() => {
    let cancelled = false
    loadGrants().then((next) => {
      if (cancelled) return
      if (!selectedId && next[0]) setSelectedId(next[0].id)
    })
    return () => { cancelled = true }
  }, [loadGrants])

  useEffect(() => {
    if (!targetedGrantId) return
    setSelectedId(targetedGrantId)
    const grant = grants.find((page) => page.id === targetedGrantId)
    if (grant) setActiveOutcome(grant.frontmatter?.outcome || 'pending')
    setTargetedGrantId(null)
  }, [targetedGrantId, grants, setTargetedGrantId])

  const ingestGrantDocument = async (document, duplicateConfirmed = false) => {
    if (!adapter || ingestingDocId) return
    setIngestingDocId(document.id)
    try {
      const result = await new GrantIngestion({ adapter }).ingestDocument({
        ...document,
        reference_type: 'grant',
        user_data: {
          ...document.user_data,
          wiki_type: 'grant'
        }
      }, { confirmDuplicate: duplicateConfirmed })
      const page = result.page
      if (result.alreadyIngested) {
        showToast({ message: `Already ingested as '${page.frontmatter.title}'`, type: 'info' })
      } else {
        updateDocument(document.id, {
          reference_type: 'grant',
          user_data: {
            ...document.user_data,
            wiki_type: 'grant'
          },
          wiki: {
            ...document.wiki,
            grant_page_id: page.id,
            grant_page_path: page.path,
            grant_ingested_at: new Date().toISOString()
          }
        })
        await useLibraryStore.getState().saveLibrary(adapter)
        showToast({ message: `Grant wiki page created: ${page.frontmatter.title}`, type: 'success' })
      }
      await loadGrants()
      setSelectedId(page.id)
      setActiveOutcome(page.frontmatter?.outcome || 'pending')
    } catch (error) {
      if (error.code === 'GRANT_POSSIBLE_DUPLICATE') {
        const ok = window.confirm(error.message)
        if (ok) return ingestGrantDocument(document, true)
      } else {
        console.error('Grant ingestion failed:', error)
        showToast({ message: error.message || 'Grant ingestion failed', type: 'error' })
      }
    } finally {
      setIngestingDocId(null)
    }
  }

  const counts = useMemo(() => {
    const next = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]))
    for (const grant of grants.filter((page) => showArchived || page.frontmatter?.archived !== true)) {
      const outcome = OUTCOMES.includes(grant.frontmatter?.outcome) ? grant.frontmatter.outcome : 'other'
      next[outcome] += 1
    }
    return next
  }, [grants, showArchived])

  const filtered = grants.filter((grant) => {
    if (!showArchived && grant.frontmatter?.archived === true) return false
    const outcome = OUTCOMES.includes(grant.frontmatter?.outcome) ? grant.frontmatter.outcome : 'other'
    return outcome === activeOutcome
  })
  const visibleGrants = grants.filter((grant) => showArchived || grant.frontmatter?.archived !== true)
  const selected = filtered.find(grant => grant.id === selectedId) || filtered[0] || visibleGrants[0]
  const pendingGrantDocs = getUningestedGrantDocuments(documents, folders)

  const onSaved = async (page) => {
    const next = await loadGrants()
    setSelectedId(page.id)
    setActiveOutcome(page.frontmatter?.outcome || 'pending')
    const refreshed = next.find((entry) => entry.id === page.id)
    showToast({ message: refreshed ? 'Grant page saved' : 'Grant page saved; refresh if it is not visible', type: 'success' })
  }

  const onArchived = async (page) => {
    const next = await loadGrants()
    const visible = next.filter((grant) => grant.frontmatter?.archived !== true)
    setSelectedId(visible[0]?.id || null)
    setShowArchived(false)
    showToast({ message: `Archived '${page.frontmatter?.title || page.id}'`, type: 'success' })
  }

  return (
    <div className={wikiStyles.inbox}>
      <div className={wikiStyles.header}>
        <div>
          <h2>Grants</h2>
          <p>Private grant namespace. Edit outcomes, feedback, notes, and related source documents.</p>
        </div>
      </div>

      {pendingGrantDocs.length > 0 && (
        <section className={wikiStyles.change}>
          <h3>Grant Documents To Ingest</h3>
          <div className={wikiStyles.proposalList}>
            {pendingGrantDocs.map(document => (
              <div key={document.id} className={wikiStyles.queueItem}>
                <div>
                  <strong>{document.metadata?.title || document.filename || document.id}</strong>
                  <p>{document.filename || document.box_path || 'ScholarLib document'}</p>
                </div>
                <button
                  className={wikiStyles.primaryBtn}
                  type="button"
                  onClick={() => ingestGrantDocument(document)}
                  disabled={!adapter || ingestingDocId === document.id}
                >
                  {ingestingDocId === document.id ? 'Ingesting...' : 'Ingest grant'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className={styles.buckets}>
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            type="button"
            className={`${styles.bucket} ${activeOutcome === outcome ? styles.active : ''}`}
            onClick={() => setActiveOutcome(outcome)}
          >
            {outcome} · {loading && grants.length === 0 ? '...' : counts[outcome] || 0}
          </button>
        ))}
        <label className={styles.archiveToggle}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {loadError ? (
        <div className={wikiStyles.empty}>{loadError}</div>
      ) : loading && grants.length === 0 ? (
        <div className={wikiStyles.empty}>Loading grants...</div>
      ) : visibleGrants.length === 0 ? (
        <div className={wikiStyles.empty}>No grant pages found.</div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.list}>
            {filtered.map(grant => (
              <button
                key={grant.id}
                className={`${styles.cardButton} ${selected?.id === grant.id ? styles.active : ''}`}
                type="button"
                onClick={() => setSelectedId(grant.id)}
              >
                <strong>{grant.frontmatter?.title || grant.id}</strong>
                <span className={styles.meta}>
                  {grant.frontmatter?.funder || 'Unknown funder'} · {grant.frontmatter?.submitted || 'No year'}
                  {grant.frontmatter?.archived ? ' · archived' : ''}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div className={wikiStyles.empty}>No grants in this outcome bucket.</div>}
          </div>
          <GrantOutcomeForm
            grantPage={selected}
            grants={grants}
            library={library}
            adapter={adapter}
            onSaved={onSaved}
            onArchived={onArchived}
          />
        </div>
      )}
    </div>
  )
}
