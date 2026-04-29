import { useCallback } from 'react'
import { useUIStore } from '../store/uiStore'
import { useLibraryStore } from '../store/libraryStore'
import { useStorageStore } from '../store/storageStore'
import { PaperExtractor, ProposalBuilder, WikiService } from '../services/wiki'
import { GrantIngestion } from '../services/wiki/grants/GrantIngestion'
import { isGrantDocument } from '../services/wiki/grants/GrantLibraryClassifier'
import { useToast } from './useToast'

/**
 * Centralised wiki ingestion entry points used by both the MainPanel
 * top-bar button and the doc-card right-click menu. Routes everything
 * through the metadata pre-flight modal so the user can correct titles
 * and pick paper-vs-grant before the pipeline runs.
 */
export function useWikiIngestion() {
  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const folders = useLibraryStore((s) => s.folders)
  const updateDocument = useLibraryStore((s) => s.updateDocument)

  const isIngesting = useUIStore((s) => s.wikiIngesting)
  const preflight = useUIStore((s) => s.wikiPreflight)
  const setWikiIngesting = useUIStore((s) => s.setWikiIngesting)
  const setWikiPreflight = useUIStore((s) => s.setWikiPreflight)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const setWikiWorkspaceTab = useUIStore((s) => s.setWikiWorkspaceTab)
  const setWikiSelectedGrantPageId = useUIStore((s) => s.setWikiSelectedGrantPageId)

  const { showToast } = useToast()

  const requestIngest = useCallback((doc) => {
    if (!doc?.id || !adapter || isDemoMode || isIngesting) return
    setWikiPreflight({
      document: doc,
      defaultType: isGrantDocument(doc, folders) ? 'grant' : 'paper',
    })
  }, [adapter, isDemoMode, isIngesting, folders, setWikiPreflight])

  const cancelPreflight = useCallback(() => {
    setWikiPreflight(null)
  }, [setWikiPreflight])

  const ingestPaper = useCallback(async (doc) => {
    const docId = doc?.id
    if (!docId || !adapter || isDemoMode) return
    setWikiIngesting(true)
    try {
      const state = useLibraryStore.getState()
      const library = {
        version: '1.3',
        folders: state.folders,
        documents: state.documents,
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections,
      }
      await WikiService.regenerateSidecars(adapter)
      const updatedLibrary = {
        ...library,
        documents: { ...library.documents, [docId]: doc },
      }
      const extraction = await new PaperExtractor().extractPaper(docId, updatedLibrary, adapter)
      const proposalId = await new ProposalBuilder({ adapter }).buildProposal(extraction, updatedLibrary)
      showToast({ message: `Wiki proposal created: ${proposalId}`, type: 'success' })
      setActivePanel('wiki')
    } catch (error) {
      console.error('Wiki ingestion failed:', error)
      showToast({ message: error.message || 'Wiki ingestion failed', type: 'error' })
    } finally {
      setWikiIngesting(false)
    }
  }, [adapter, isDemoMode, setActivePanel, setWikiIngesting, showToast])

  const ingestGrant = useCallback(async (doc, { confirmDuplicate = false } = {}) => {
    const docId = doc?.id
    if (!docId || !doc || !adapter || isDemoMode) return
    setWikiIngesting(true)
    try {
      const result = await new GrantIngestion({ adapter }).ingestDocument({
        ...doc,
        id: docId,
        reference_type: 'grant',
        user_data: {
          ...doc.user_data,
          wiki_type: 'grant',
        },
      }, { confirmDuplicate })
      const page = result.page

      updateDocument(docId, {
        reference_type: 'grant',
        user_data: {
          ...doc.user_data,
          wiki_type: 'grant',
        },
        wiki: {
          ...doc.wiki,
          grant_page_id: page.id,
          grant_page_path: page.path,
          grant_ingested_at: new Date().toISOString(),
        },
      })
      await useLibraryStore.getState().saveLibrary(adapter)
      showToast({
        message: result.alreadyIngested
          ? `Already ingested as '${page.frontmatter.title}'`
          : `Grant wiki page created: ${page.frontmatter.title}`,
        type: result.alreadyIngested ? 'info' : 'success',
      })
      setWikiSelectedGrantPageId(page.id)
      setWikiWorkspaceTab('grants')
      setActivePanel('wiki')
    } catch (error) {
      if (error?.code === 'GRANT_POSSIBLE_DUPLICATE') {
        const ok = window.confirm(error.message)
        if (ok) {
          setWikiIngesting(false)
          return ingestGrant(doc, { confirmDuplicate: true })
        }
      } else {
        console.error('Grant ingestion failed:', error)
        showToast({ message: error.message || 'Grant ingestion failed', type: 'error' })
      }
    } finally {
      setWikiIngesting(false)
    }
  }, [
    adapter,
    isDemoMode,
    updateDocument,
    setWikiIngesting,
    setActivePanel,
    setWikiWorkspaceTab,
    setWikiSelectedGrantPageId,
    showToast,
  ])

  const runPreflightIngest = useCallback(async (document, type) => {
    setWikiPreflight(null)
    if (type === 'grant') await ingestGrant(document)
    else await ingestPaper(document)
  }, [ingestGrant, ingestPaper, setWikiPreflight])

  return {
    isIngesting,
    preflight,
    requestIngest,
    cancelPreflight,
    runPreflightIngest,
  }
}
