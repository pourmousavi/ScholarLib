import { useState, useEffect } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import PDFViewer from '../viewer/PDFViewer'
import { NotesPanel } from '../notes'
import { ChatPanel } from '../ai'
import styles from './MainPanel.module.css'

export default function MainPanel() {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfError, setPdfError] = useState(null)

  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const setShowModal = useUIStore((s) => s.setShowModal)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleDocList = useUIStore((s) => s.toggleDocList)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const docListCollapsed = useUIStore((s) => s.docListCollapsed)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const documents = useLibraryStore((s) => s.documents)
  const selectedDoc = selectedDocId ? documents[selectedDocId] : null

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)

  const panels = [
    { id: 'pdf', label: 'PDF' },
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

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
          {(sidebarCollapsed || docListCollapsed) && (
            <button
              className={styles.menuBtn}
              onClick={() => {
                if (sidebarCollapsed) toggleSidebar()
                else if (docListCollapsed) toggleDocList()
              }}
            >
              m
            </button>
          )}
          <span className={styles.docTitle}>
            {selectedDoc?.metadata?.title || 'No document selected'}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.shareBtn}
            onClick={handleShare}
            disabled={!selectedFolderId}
            title="Share folder"
          >
            @
          </button>
        </div>
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
      </div>

      {/* Panel content */}
      <div className={styles.content}>
        {activePanel === 'pdf' && (
          <PDFViewer
            url={pdfUrl}
            docId={selectedDocId}
            onTextExtracted={handleTextExtracted}
            error={pdfError}
          />
        )}
        {activePanel === 'ai' && (
          <ChatPanel />
        )}
        {activePanel === 'notes' && (
          <NotesPanel />
        )}
      </div>
    </div>
  )
}
