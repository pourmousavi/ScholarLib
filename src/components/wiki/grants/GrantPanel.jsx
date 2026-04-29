import { useCallback, useEffect, useState } from 'react'
import { useLibraryStore } from '../../../store/libraryStore'
import { useToast } from '../../../hooks/useToast'
import { PageStore } from '../../../services/wiki/PageStore'
import { GrantIngestion } from '../../../services/wiki/grants/GrantIngestion'
import { getUningestedGrantDocuments } from '../../../services/wiki/grants/GrantLibraryClassifier'
import styles from '../Wiki.module.css'

export default function GrantPanel({ adapter }) {
  const [grants, setGrants] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [ingestingDocId, setIngestingDocId] = useState(null)
  const documents = useLibraryStore((s) => s.documents)
  const folders = useLibraryStore((s) => s.folders)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const { showToast } = useToast()

  const loadGrants = useCallback(async () => {
    if (!adapter) return
    const pages = await PageStore.listPages(adapter)
    setGrants(pages.filter(page => page.frontmatter?.type === 'grant'))
  }, [adapter])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!adapter) return
      const pages = await PageStore.listPages(adapter)
      if (!cancelled) setGrants(pages.filter(page => page.frontmatter?.type === 'grant'))
    }
    load()
    return () => { cancelled = true }
  }, [adapter])

  const ingestGrantDocument = async (document) => {
    if (!adapter || ingestingDocId) return
    setIngestingDocId(document.id)
    try {
      const page = await new GrantIngestion({ adapter }).ingestDocument({
        ...document,
        reference_type: 'grant',
        user_data: {
          ...document.user_data,
          wiki_type: 'grant'
        }
      })
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
      await loadGrants()
      setSelectedId(page.id)
      showToast({ message: `Grant wiki page created: ${page.frontmatter.title}`, type: 'success' })
    } catch (error) {
      console.error('Grant ingestion failed:', error)
      showToast({ message: error.message || 'Grant ingestion failed', type: 'error' })
    } finally {
      setIngestingDocId(null)
    }
  }

  const selected = grants.find(grant => grant.id === selectedId) || grants[0]
  const pendingGrantDocs = getUningestedGrantDocuments(documents, folders)
  const grouped = grants.reduce((acc, grant) => {
    const key = grant.frontmatter?.outcome || 'pending'
    acc[key] ||= []
    acc[key].push(grant)
    return acc
  }, {})

  return (
    <div className={styles.inbox}>
      <div className={styles.header}>
        <div>
          <h2>Grants</h2>
          <p>Private grant namespace. Mark a folder as grants to show its documents here.</p>
        </div>
      </div>

      {pendingGrantDocs.length > 0 && (
        <section className={styles.change}>
          <h3>Grant Documents To Ingest</h3>
          <div className={styles.proposalList}>
            {pendingGrantDocs.map(document => (
              <div key={document.id} className={styles.queueItem}>
                <div>
                  <strong>{document.metadata?.title || document.filename || document.id}</strong>
                  <p>{document.filename || document.box_path || 'ScholarLib document'}</p>
                </div>
                <button
                  className={styles.primaryBtn}
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

      {grants.length === 0 ? (
        <div className={styles.empty}>No grant pages found.</div>
      ) : (
        <div className={styles.diff}>
          <div>
            {Object.entries(grouped).map(([outcome, rows]) => (
              <section key={outcome} className={styles.change}>
                <h3>{outcome}</h3>
                {rows.map(grant => (
                  <button key={grant.id} className={styles.proposalItem} type="button" onClick={() => setSelectedId(grant.id)}>
                    <span>{grant.frontmatter?.title || grant.id}</span>
                    <span>{grant.frontmatter?.submitted || ''}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
          {selected && (
            <article className={styles.change}>
              <h3>{selected.frontmatter?.title}</h3>
              <p>{selected.frontmatter?.funder} {selected.frontmatter?.program}</p>
              <p>Outcome: {selected.frontmatter?.outcome}</p>
              <pre>{selected.body}</pre>
            </article>
          )}
        </div>
      )}
    </div>
  )
}
