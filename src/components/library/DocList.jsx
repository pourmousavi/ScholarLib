import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useIndexStore } from '../../store/indexStore'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { useToast } from '../../hooks/useToast'
import DocCard from './DocCard'
import IndexingBar from './IndexingBar'
import ActiveFilters from './ActiveFilters'
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
  const selectedTags = useLibraryStore((s) => s.selectedTags)
  const tagFilterMode = useLibraryStore((s) => s.tagFilterMode)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const isIndexing = useIndexStore((s) => s.isIndexing)
  const startIndexing = useIndexStore((s) => s.startIndexing)
  const setProgress = useIndexStore((s) => s.setProgress)
  const completeIndexing = useIndexStore((s) => s.completeIndexing)
  const failIndexing = useIndexStore((s) => s.failIndexing)
  const startBatchIndexing = useIndexStore((s) => s.startBatchIndexing)
  const updateBatchProgress = useIndexStore((s) => s.updateBatchProgress)
  const completeBatchIndexing = useIndexStore((s) => s.completeBatchIndexing)

  const { showToast } = useToast()

  const folder = folders.find(f => f.id === selectedFolderId)

  // Check if we're viewing by tags (no folder selected, but tags selected)
  const isTagView = selectedTags.length > 0 && !selectedFolderId

  // Get all docs - either for folder or filtered by tags
  const allDocs = Object.values(documents)
    .filter(d => {
      // If viewing by tags, show docs from all folders that match tags
      if (isTagView) {
        const docTags = d.user_data?.tags || []
        if (tagFilterMode === 'AND') {
          return selectedTags.every(t => docTags.includes(t))
        } else {
          return selectedTags.some(t => docTags.includes(t))
        }
      }
      // Otherwise, filter by selected folder
      return d.folder_id === selectedFolderId
    })
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))

  // Apply additional filters (unread, starred, pending)
  let filteredDocs = allDocs.filter(doc => {
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

  // If in folder view but tags are also selected, apply tag filter too
  if (!isTagView && selectedTags.length > 0) {
    filteredDocs = filteredDocs.filter(doc => {
      const docTags = doc.user_data?.tags || []
      if (tagFilterMode === 'AND') {
        return selectedTags.every(t => docTags.includes(t))
      } else {
        return selectedTags.some(t => docTags.includes(t))
      }
    })
  }

  // Build breadcrumb
  const breadcrumb = []
  let current = folder
  while (current) {
    breadcrumb.unshift(current)
    current = current.parent_id ? folders.find(f => f.id === current.parent_id) : null
  }

  // Get pending documents for this folder
  const getPendingDocs = () => allDocs.filter(
    d => !d.index_status?.status ||
         d.index_status?.status === 'pending' ||
         d.index_status?.status === 'processing' ||
         d.index_status?.status === 'failed'
  )

  // Index a single document
  const indexDocument = async (doc) => {
    if (!adapter || !isConnected) {
      console.log('Cannot index: storage not connected')
      return false
    }

    const docName = doc.metadata?.title || doc.filename || 'document'
    startIndexing(doc.id, docName)

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

  // Index all pending documents in the folder
  const handleIndexAll = async () => {
    if (!adapter || !isConnected || isDemoMode) {
      showToast({ message: 'Storage connection required for indexing', type: 'warning' })
      return
    }

    if (isIndexing) {
      showToast({ message: 'Indexing already in progress', type: 'info' })
      return
    }

    const docsToIndex = getPendingDocs()

    if (docsToIndex.length === 0) {
      showToast({ message: 'No documents to index', type: 'info' })
      return
    }

    // Start batch mode
    startBatchIndexing(docsToIndex.length)

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < docsToIndex.length; i++) {
      const doc = docsToIndex[i]
      updateBatchProgress(i)

      const success = await indexDocument(doc)
      if (success) {
        successCount++
      } else {
        failCount++
      }
    }

    // Complete batch
    completeBatchIndexing()

    // Show result
    if (failCount === 0) {
      showToast({
        message: `Successfully indexed ${successCount} document${successCount !== 1 ? 's' : ''}`,
        type: 'success'
      })
    } else if (successCount > 0) {
      showToast({
        message: `Indexed ${successCount} document${successCount !== 1 ? 's' : ''}, ${failCount} failed`,
        type: 'warning'
      })
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
        const success = await indexDocument(doc)
        if (success) {
          showToast({ message: 'Document indexed and ready for AI chat', type: 'success' })
        }
      }
    } catch (error) {
      console.error('Upload failed:', error)
      showToast({ message: error.message || 'Failed to upload document', type: 'error' })
    }
  }

  // Build tag view title
  const getTagViewTitle = () => {
    if (selectedTags.length === 0) return ''
    const tagNames = selectedTags.map(slug => tagRegistry[slug]?.displayName || slug)
    const connector = tagFilterMode === 'AND' ? ' & ' : ' | '
    return tagNames.join(connector)
  }

  if (!folder && !isTagView) {
    return (
      <div className={styles.docList}>
        <div className={styles.empty}>Select a folder or tag</div>
      </div>
    )
  }

  return (
    <div className={styles.docList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          {isTagView ? (
            <span className={styles.tagViewTitle}>
              <span className={styles.tagIcon}>🏷</span>
              {getTagViewTitle()}
            </span>
          ) : (
            breadcrumb.map((f, i) => (
              <span key={f.id}>
                {i > 0 && <span className={styles.separator}> › </span>}
                <span className={i === breadcrumb.length - 1 ? styles.current : ''}>
                  {f.name}
                </span>
              </span>
            ))
          )}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.docCount}>{allDocs.length} documents</span>
          {!isTagView && (
            <button
              className={styles.addBtn}
              onClick={() => setShowUpload(!showUpload)}
            >
              {showUpload ? '✕ Cancel' : '+ Add'}
            </button>
          )}
        </div>
      </div>

      {/* Active tag filters */}
      <ActiveFilters />

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

      {/* Indexing bar */}
      <IndexingBar
        pendingDocs={getPendingDocs()}
        onIndexAll={handleIndexAll}
      />
    </div>
  )
}
