import { useState, useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { LibraryService } from '../../services/library/LibraryService'
import { useToast } from '../../hooks/useToast'
import { needsEnrichment } from '../../utils/enrichment'
import { enrichFromDOI } from '../../services/metadata/EnrichmentService'
import ViewerSwitch from '../viewer/ViewerSwitch'
import SplitViewPanel from './SplitViewPanel'
import { NotesPanel } from '../notes'
import { ChatPanel } from '../ai'
import LitOrbitInsights from '../library/LitOrbitInsights'
import styles from './MainPanel.module.css'

export default function MainPanel({ isMobile = false }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfError, setPdfError] = useState(null)

  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const setShowModal = useUIStore((s) => s.setShowModal)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleDocList = useUIStore((s) => s.toggleDocList)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)
  const splitViewEnabled = useUIStore((s) => s.splitViewEnabled)
  const toggleSplitView = useUIStore((s) => s.toggleSplitView)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const documents = useLibraryStore((s) => s.documents)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const selectedDoc = selectedDocId ? documents[selectedDocId] : null

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const { showToast } = useToast()
  const attachInputRef = useRef(null)

  const noPdfAttached = selectedDoc && !selectedDoc.box_path

  const handleAttachPdf = useCallback(() => {
    if (isDemoMode || !adapter) return
    attachInputRef.current?.click()
  }, [isDemoMode, adapter])

  const handleAttachFileSelected = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast({ message: 'Only PDF files are supported', type: 'error' })
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      showToast({ message: 'File must be under 200MB', type: 'error' })
      return
    }

    const title = selectedDoc?.metadata?.title
    const sanitized = title ? title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) : ''
    const filename = sanitized ? sanitized + '.pdf' : file.name

    try {
      const state = useLibraryStore.getState()
      const library = {
        version: '1.1',
        folders: state.folders,
        documents: { ...state.documents },
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections
      }
      const result = await LibraryService.attachPdf(adapter, library, selectedDocId, file, filename)
      updateDocument(selectedDocId, {
        box_path: result.box_path,
        box_file_id: result.box_file_id,
        filename: result.filename
      })
      showToast({ message: 'PDF attached successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to attach PDF:', error)
      showToast({ message: 'Failed to attach PDF', type: 'error' })
    }
  }, [selectedDoc, selectedDocId, adapter, updateDocument, showToast])

  const isLitOrbitImport = selectedDoc?.import_source?.type === 'litorbit'
  const showEnrichment = noPdfAttached && isLitOrbitImport && needsEnrichment(selectedDoc)

  const [isEnriching, setIsEnriching] = useState(false)

  const handleEnrichMetadata = useCallback(async () => {
    if (!selectedDoc?.metadata?.doi || isEnriching) return
    setIsEnriching(true)
    try {
      const enrichedFields = await enrichFromDOI(selectedDoc.metadata.doi)
      if (!enrichedFields) {
        showToast({ message: 'Could not enrich metadata — DOI not found in CrossRef', type: 'warning' })
        return
      }
      const state = useLibraryStore.getState()
      const library = {
        version: '1.1',
        folders: state.folders,
        documents: { ...state.documents },
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections
      }
      await LibraryService.updateDocumentMetadata(adapter, library, selectedDocId, enrichedFields)
      updateDocument(selectedDocId, { metadata: { ...selectedDoc.metadata, ...enrichedFields } })
      showToast({ message: 'Metadata enriched from CrossRef', type: 'success' })
    } catch (error) {
      console.error('Enrichment failed:', error)
      showToast({ message: 'Could not enrich metadata — DOI not found in CrossRef', type: 'warning' })
    } finally {
      setIsEnriching(false)
    }
  }, [selectedDoc, selectedDocId, adapter, updateDocument, showToast, isEnriching])

  const panels = [
    { id: 'pdf', label: 'PDF' },
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

  // Auto-mark document as read when opened (debounced to avoid racing with user-initiated saves)
  const readMarkTimerRef = useRef(null)
  useEffect(() => {
    if (!selectedDocId) return

    const doc = documents[selectedDocId]
    if (!doc) return

    // Only mark as read if it's currently unread
    if (!doc.user_data?.read) {
      updateDocument(selectedDocId, {
        user_data: {
          ...doc.user_data,
          read: true,
          read_at: new Date().toISOString()
        }
      })

      // Persist to storage with a delay to avoid racing with immediate user actions
      if (!isDemoMode && adapter) {
        clearTimeout(readMarkTimerRef.current)
        readMarkTimerRef.current = setTimeout(async () => {
          try {
            // Re-read store state at save time to capture any interim changes
            const library = useLibraryStore.getState().getLibrarySnapshot()
            await LibraryService.saveLibrary(adapter, library)
          } catch (e) {
            console.error('Failed to save read status:', e)
          }
        }, 2000)
      }
    }

    return () => clearTimeout(readMarkTimerRef.current)
  }, [selectedDocId, adapter, isDemoMode, updateDocument]) // Include necessary deps

  // Fetch PDF URL when document changes
  useEffect(() => {
    if (!selectedDoc || !adapter || !isConnected) {
      setPdfUrl(null)
      setPdfError(null)
      return
    }

    const fetchPdfUrl = async () => {
      try {
        setPdfError(null)
        // Use box_path to get streaming URL from storage adapter
        const path = selectedDoc.box_path
        if (!path) {
          setPdfError('Document has no file path')
          return
        }

        console.log('Fetching PDF URL for:', path)
        const url = await adapter.getFileStreamURL(path)
        console.log('Got PDF URL:', url)
        setPdfUrl(url)
      } catch (error) {
        console.error('Failed to get PDF URL:', error)
        setPdfError(error.message || 'Failed to load PDF')
        setPdfUrl(null)
      }
    }

    fetchPdfUrl()
  }, [selectedDoc, adapter, isConnected])

  const handleTextExtracted = (text) => {
    // Will be used in Stage 11 for indexing
    console.log('Extracted text length:', text.length)
  }

  const handleShare = () => {
    setShowModal('share')
  }

  return (
    <div className={styles.panel}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.left}>
          {/* Only show hamburger on tablet (not mobile, which has bottom nav) */}
          {!isMobile && (sidebarCollapsed || docListCollapsed) && (
            <button
              className={styles.menuBtn}
              onClick={() => {
                if (sidebarCollapsed) toggleSidebar()
                else if (docListCollapsed) toggleDocList()
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
          <span className={styles.docTitle}>
            {selectedDoc?.metadata?.title || 'No document selected'}
          </span>
        </div>
        <div className={styles.actions}>
          {/* Hide split view on mobile - not suitable for small screens */}
          {!isMobile && (
            <button
              className={`${styles.splitViewBtn} ${splitViewEnabled ? styles.active : ''}`}
              onClick={toggleSplitView}
              title={splitViewEnabled ? 'Exit split view' : 'Enter split view'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
              </svg>
            </button>
          )}
          <button
            className={styles.shareBtn}
            onClick={handleShare}
            disabled={!selectedFolderId}
            title="Share folder"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </button>
        </div>
        {/* Hide top tabs on mobile - bottom nav handles panel switching */}
        {!isMobile && !splitViewEnabled && (
          <div className={styles.tabs}>
            {panels.map((p) => (
              <button
                key={p.id}
                className={`${styles.tab} ${activePanel === p.id ? styles.active : ''}`}
                onClick={() => setActivePanel(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel content */}
      <div className={styles.content}>
        {splitViewEnabled ? (
          <SplitViewPanel
            pdfUrl={pdfUrl}
            docId={selectedDocId}
            onTextExtracted={handleTextExtracted}
            pdfError={pdfError}
            noPdfAttached={noPdfAttached}
            onAttachPdf={handleAttachPdf}
            showEnrichment={showEnrichment}
            isEnriching={isEnriching}
            onEnrichMetadata={handleEnrichMetadata}
            isLitOrbitImport={isLitOrbitImport}
          />
        ) : (
          <>
            {activePanel === 'pdf' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', minWidth: 0 }}>
                <ViewerSwitch
                  url={pdfUrl}
                  docId={selectedDocId}
                  onTextExtracted={handleTextExtracted}
                  error={pdfError}
                  noPdfAttached={noPdfAttached}
                  onAttachPdf={handleAttachPdf}
                  showEnrichment={showEnrichment}
                  isEnriching={isEnriching}
                  onEnrichMetadata={handleEnrichMetadata}
                  isLitOrbitImport={isLitOrbitImport}
                />
                {isLitOrbitImport && (selectedDoc?.import_source?.litorbit_score != null || selectedDoc?.import_source?.litorbit_summary) && (
                  <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <LitOrbitInsights importSource={selectedDoc.import_source} />
                  </div>
                )}
              </div>
            )}
            {activePanel === 'ai' && (
              <ChatPanel />
            )}
            {activePanel === 'notes' && (
              <NotesPanel />
            )}
          </>
        )}
      </div>

      <input
        ref={attachInputRef}
        type="file"
        accept=".pdf"
        onChange={handleAttachFileSelected}
        style={{ display: 'none' }}
      />
    </div>
  )
}
