import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useIndexStore } from '../../store/indexStore'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { useToast } from '../../hooks/useToast'
import DocCard from './DocCard'
import PendingNotice from './PendingNotice'
import UploadZone from '../metadata/UploadZone'
import styles from './DocList.module.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'pending', label: 'Pending' }
]

export default function DocList() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const addDocument = useLibraryStore((s) => s.addDocument)

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const isIndexing = useIndexStore((s) => s.isIndexing)
  const currentDocId = useIndexStore((s) => s.currentDocId)
  const indexProgress = useIndexStore((s) => s.progress)
  const startIndexing = useIndexStore((s) => s.startIndexing)
  const setProgress = useIndexStore((s) => s.setProgress)
  const completeIndexing = useIndexStore((s) => s.completeIndexing)
  const failIndexing = useIndexStore((s) => s.failIndexing)

  const { showToast } = useToast()

  const folder = folders.find(f => f.id === selectedFolderId)

  // Get all docs for the selected folder
  const allDocs = Object.values(documents)
    .filter(d => d.folder_id === selectedFolderId)
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))

  // Apply filter
  const filteredDocs = allDocs.filter(doc => {
    switch (activeFilter) {
      case 'unread':
        return !doc.user_data?.read
      case 'starred':
        return doc.user_data?.starred
      case 'pending':
        // Show documents that need indexing (no status, pending, or processing)
        return !doc.index_status?.status || doc.index_status?.status === 'pending' || doc.index_status?.status === 'processing'
      default:
        return true
    }
  })

  // Count pending docs (including documents without index_status)
  const pendingCount = allDocs.filter(
    d => !d.index_status?.status || d.index_status?.status === 'pending' || d.index_status?.status === 'processing'
  ).length

  // Build breadcrumb
  const breadcrumb = []
  let current = folder
  while (current) {
    breadcrumb.unshift(current)
    current = current.parent_id ? folders.find(f => f.id === current.parent_id) : null
  }

  // Index a single document
  const indexDocument = async (doc) => {
    if (!adapter || !isConnected) {
      console.log('Cannot index: storage not connected')
      return false
    }

    startIndexing(doc.id)

    try {
      // Get the actual PDF URL from storage
      const pdfURL = await adapter.getFileStreamURL(doc.box_path)

      await indexService.indexDocument(doc.id, pdfURL, adapter, (progress) => {
        setProgress(progress)
      })

      completeIndexing(doc.id)
      return true
    } catch (error) {
      console.error('Indexing failed:', error)
      failIndexing(doc.id, error)
      return false
    }
  }

  const handleIndexNow = async () => {
    if (!adapter || !isConnected || isDemoMode) {
      showToast({ message: 'Storage connection required for indexing', type: 'warning' })
      return
    }

    if (isIndexing) {
      showToast({ message: 'Indexing already in progress', type: 'info' })
      return
    }

    // Get pending documents
    const pendingDocs = allDocs.filter(
      d => d.index_status?.status === 'pending' || d.index_status?.status === 'processing' || !d.index_status?.status
    )

    if (pendingDocs.length === 0) {
      showToast({ message: 'No documents to index', type: 'info' })
      return
    }

    // Index first pending document
    const doc = pendingDocs[0]
    const success = await indexDocument(doc)

    if (success) {
      showToast({ message: `Indexed "${doc.metadata?.title || doc.filename}"`, type: 'success' })

      // If more pending, show message
      if (pendingDocs.length > 1) {
        showToast({ message: `${pendingDocs.length - 1} more documents pending`, type: 'info' })
      }
    } else {
      showToast({ message: 'Indexing failed', type: 'error' })
    }
  }

  const handleUploadComplete = async ({ file, metadata, folderId }) => {
    if (!adapter || !isConnected) {
      showToast({ message: 'Storage not connected', type: 'error' })
      return
    }

    try {
      // Build library object from current state
      const library = {
        folders,
        documents,
        version: '1.0',
        last_modified: new Date().toISOString()
      }

      // Add document via LibraryService
      const doc = await LibraryService.addDocument(adapter, library, {
        folder_id: folderId,
        filename: file.name,
        metadata: {
          ...metadata,
          extraction_date: new Date().toISOString()
        },
        tags: metadata.keywords || []
      }, file)

      // Update local store
      addDocument(doc)

      showToast({ message: `Added "${metadata.title || file.name}"`, type: 'success' })
      setShowUpload(false)

      // Auto-index the document for AI chat
      if (!isDemoMode) {
        showToast({ message: 'Indexing for AI chat...', type: 'info' })
        const success = await indexDocument(doc)
        if (success) {
          showToast({ message: 'Document ready for AI chat', type: 'success' })
        }
      }
    } catch (error) {
      console.error('Upload failed:', error)
      showToast({ message: error.message || 'Failed to upload document', type: 'error' })
    }
  }

  if (!folder) {
    return (
      <div className={styles.docList}>
        <div className={styles.empty}>Select a folder</div>
      </div>
    )
  }

  return (
    <div className={styles.docList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          {breadcrumb.map((f, i) => (
            <span key={f.id}>
              {i > 0 && <span className={styles.separator}> › </span>}
              <span className={i === breadcrumb.length - 1 ? styles.current : ''}>
                {f.name}
              </span>
            </span>
          ))}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.docCount}>{allDocs.length} documents</span>
          <button
            className={styles.addBtn}
            onClick={() => setShowUpload(!showUpload)}
          >
            {showUpload ? '✕ Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {/* Upload zone */}
      {showUpload && (
        <div className={styles.uploadSection}>
          <UploadZone
            folderId={selectedFolderId}
            onUploadComplete={handleUploadComplete}
            onClose={() => setShowUpload(false)}
          />
        </div>
      )}

      {/* Filter tabs */}
      <div className={styles.filters}>
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={`${styles.filter} ${activeFilter === filter.id ? styles.active : ''}`}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className={styles.list}>
        {filteredDocs.length === 0 ? (
          <div className={styles.emptyList}>
            {activeFilter === 'all'
              ? 'No documents in this folder'
              : `No ${activeFilter} documents`}
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))
        )}
      </div>

      {/* Pending notice */}
      <PendingNotice count={pendingCount} onIndexNow={handleIndexNow} />
    </div>
  )
}
