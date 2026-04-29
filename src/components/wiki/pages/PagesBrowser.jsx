import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { PageStore } from '../../../services/wiki/PageStore'
import { WikiPaths } from '../../../services/wiki/WikiPaths'
import { stringifyWikiMarkdown } from '../../../services/wiki/WikiMarkdown'
import PageReader from '../PageReader'
import styles from './PagesBrowser.module.css'

const TYPE_ORDER = ['paper', 'concept', 'method', 'dataset', 'position', 'position_draft', 'grant', 'question', 'person', 'analysis']

function typeLabel(type) {
  return String(type || 'paper').replace(/_/g, ' ')
}

function aliasMapForSearch(aliasesSidecar) {
  const map = {}
  for (const [alias, entry] of Object.entries(aliasesSidecar?.aliases || {})) {
    const id = entry?.page_id
    if (!id) continue
    map[id] ||= []
    map[id].push(alias, entry.display)
  }
  return map
}

export default function PagesBrowser({ adapter }) {
  const [pages, setPages] = useState([])
  const [aliases, setAliases] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPage, setSelectedPage] = useState(null)
  const [rawMarkdown, setRawMarkdown] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const setActiveTab = useUIStore((s) => s.setWikiWorkspaceTab)
  const setSelectedGrantPageId = useUIStore((s) => s.setWikiSelectedGrantPageId)

  const loadPages = useCallback(async () => {
    if (!adapter) return
    setError(null)
    try {
      let nextPages = await PageStore.listPages(adapter)
      let nextAliases = {}
      try {
        nextAliases = await adapter.readJSON(WikiPaths.aliasesSidecar)
      } catch {
        nextAliases = {}
      }
      nextPages = nextPages.sort((a, b) => String(a.frontmatter?.title || a.id).localeCompare(String(b.frontmatter?.title || b.id)))
      setPages(nextPages)
      setAliases(nextAliases)
      setSelectedId((current) => current || nextPages.find((page) => !page.frontmatter?.archived)?.id || nextPages[0]?.id || null)
    } catch (err) {
      setError(err.message || 'Failed to load wiki pages')
    }
  }, [adapter])

  useEffect(() => {
    loadPages()
  }, [loadPages])

  useEffect(() => {
    let cancelled = false
    async function loadSelected() {
      if (!adapter || !selectedId) {
        setSelectedPage(null)
        setRawMarkdown('')
        return
      }
      try {
        const page = await PageStore.readPage(adapter, selectedId)
        const raw = page.path
          ? (await adapter.readTextWithMetadata(page.path)).text
          : stringifyWikiMarkdown(page.frontmatter, page.body)
        if (!cancelled) {
          setSelectedPage(page)
          setRawMarkdown(raw)
          setShowRaw(false)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to read page')
      }
    }
    loadSelected()
    return () => {
      cancelled = true
    }
  }, [adapter, selectedId])

  const aliasSearch = useMemo(() => aliasMapForSearch(aliases), [aliases])
  const pagesById = useMemo(() => {
    const byId = {}
    for (const page of pages) {
      byId[page.id] = {
        id: page.id,
        title: page.frontmatter?.title || page.id,
        type: page.frontmatter?.type || 'paper',
      }
    }
    return byId
  }, [pages])

  const filteredPages = useMemo(() => {
    const lower = query.trim().toLowerCase()
    return pages.filter((page) => {
      if (!showArchived && page.frontmatter?.archived === true) return false
      if (!lower) return true
      const haystack = [
        page.id,
        page.frontmatter?.handle,
        page.frontmatter?.title,
        ...(page.frontmatter?.aliases || []),
        ...(aliasSearch[page.id] || []),
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(lower)
    })
  }, [pages, showArchived, query, aliasSearch])

  const groups = useMemo(() => {
    const byType = new Map()
    for (const page of filteredPages) {
      const type = page.frontmatter?.type || 'paper'
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type).push(page)
    }
    return TYPE_ORDER
      .filter((type) => byType.has(type))
      .map((type) => ({ type, pages: byType.get(type) }))
  }, [filteredPages])

  const openGrantForm = () => {
    if (!selectedPage || selectedPage.frontmatter?.type !== 'grant') return
    setSelectedGrantPageId(selectedPage.id)
    setActiveTab('grants')
  }

  const handleOpenPage = (id) => {
    if (!pagesById[id]) return
    setSelectedId(id)
  }

  return (
    <div className={styles.browser}>
      <aside className={styles.sidebar}>
        <input
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages and aliases"
          aria-label="Search pages"
        />
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
        {groups.map((group) => (
          <section key={group.type} className={styles.group}>
            <h3 className={styles.groupTitle}>{typeLabel(group.type)} ({group.pages.length})</h3>
            {group.pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={`${styles.pageButton} ${selectedId === page.id ? styles.active : ''}`}
                onClick={() => setSelectedId(page.id)}
              >
                {page.frontmatter?.handle || page.id} · {page.frontmatter?.title || page.id}
              </button>
            ))}
          </section>
        ))}
      </aside>
      <main className={styles.content}>
        {error && <div className={styles.empty}>{error}</div>}
        {!error && !selectedPage && <div className={styles.empty}>No wiki page selected.</div>}
        {selectedPage && (
          <>
            <div className={styles.toolbar}>
              <div>
                <h2>{selectedPage.frontmatter?.title || selectedPage.id}</h2>
                <p className={styles.meta}>{selectedPage.frontmatter?.type || 'paper'} · {selectedPage.id}</p>
              </div>
              <div className={styles.actions}>
                {selectedPage.frontmatter?.type === 'grant' && (
                  <button type="button" className={styles.button} onClick={openGrantForm}>
                    Open in grant form
                  </button>
                )}
                <button type="button" className={styles.button} onClick={() => setShowRaw((value) => !value)}>
                  {showRaw ? 'Render page' : 'View raw'}
                </button>
              </div>
            </div>
            {showRaw ? (
              <pre className={styles.raw}>{rawMarkdown}</pre>
            ) : (
              <PageReader body={selectedPage.body} pagesById={pagesById} onOpenPage={handleOpenPage} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
