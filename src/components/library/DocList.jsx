import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useIndexStore } from '../../store/indexStore'
import { useAIStore } from '../../store/aiStore'
import { useUIStore } from '../../store/uiStore'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { collectionService } from '../../services/tags/CollectionService'
import { useToast } from '../../hooks/useToast'
import DocCard from './DocCard'
import IndexingBar from './IndexingBar'
import ActiveFilters from './ActiveFilters'
import BulkActionsBar from './BulkActionsBar'
import UploadZone from '../metadata/UploadZone'
import styles from './DocList.module.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'pending', label: 'Pending' }
]

export default function DocList({ isMobile = false }) {
  const [activeFilter, setActiveFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const addDocument = useLibraryStore((s) => s.addDocument)
  const selectedTags = useLibraryStore((s) => s.selectedTags)
  const tagFilterMode = useLibraryStore((s) => s.tagFilterMode)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const selectedCollections = useLibraryStore((s) => s.selectedCollections)
  const collectionFilterMode = useLibraryStore((s) => s.collectionFilterMode)
  const collectionRegistry = useLibraryStore((s) => s.collectionRegistry)
  const selectionMode = useLibraryStore((s) => s.selectionMode)
  const selectedDocIds = useLibraryStore((s) => s.selectedDocIds)
  const toggleSelectionMode = useLibraryStore((s) => s.toggleSelectionMode)
  const selectAllVisible = useLibraryStore((s) => s.selectAllVisible)

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const embeddingProvider = useAIStore((s) => s.embeddingProvider)

  const toggleDocList = useUIStore((s) => s.toggleDocList)
  const closeAllOverlays = useUIStore((s) => s.closeAllOverlays)
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const setDocListCollapsed = useUIStore((s) => s.setDocListCollapsed)

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

  // Check if we're viewing by collections (no folder selected, but collections selected)
  const isCollectionView = selectedCollections.length > 0 && !selectedFolderId

  // Get all docs - either for folder, filtered by tags, or filtered by collections
  const allDocs = Object.values(documents)
    .filter(d => {
      // If viewing by collections, show docs from all folders that match collection tags
      if (isCollectionView) {
        const collections = selectedCollections.map(slug => collectionRegistry[slug]).filter(Boolean)
        return collectionService.documentMatchesCollections(d, collections, collectionFilterMode)
      }
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
  if (!isTagView && !isCollectionView && selectedTags.length > 0) {
    filteredDocs = filteredDocs.filter(doc => {
      const docTags = doc.user_data?.tags || []
      if (tagFilterMode === 'AND') {
        return selectedTags.every(t => docTags.includes(t))
      } else {
        return selectedTags.some(t => docTags.includes(t))
      }
    })
  }

  // If in folder view but collections are also selected, apply collection filter too
  if (!isCollectionView && !isTagView && selectedCollections.length > 0) {
    filteredDocs = filteredDocs.filter(doc => {
      const collections = selectedCollections.map(slug => collectionRegistry[slug]).filter(Boolean)
      return collectionService.documentMatchesCollections(doc, collections, collectionFilterMode)
    })
  }

  // Build breadcrumb
  const breadcrumb = []
  let current = folder
  while (current) {
    breadcrumb.unshift(current)
    current = current.parent_id ? folders.find(f => f.id === current.parent_id) : null
  }

  // Embedding model name for the current provider
  const EMBEDDING_MODEL_NAMES = {
    gemini: 'gemini-embedding-001',
    openai: 'text-embedding-3-small',
    ollama: 'nomic-embed-text',
    browser: 'all-MiniLM-L6-v2'
  }
  const currentEmbeddingModel = EMBEDDING_MODEL_NAMES[embeddingProvider] || 'all-MiniLM-L6-v2'

  // Get pending documents for this folder
  const getPendingDocs = () => allDocs.filter(
    d => !d.index_status?.status ||
         d.index_status?.status === 'pending' ||
         d.index_status?.status === 'processing' ||
         d.index_status?.status === 'failed'
  )

  // Get documents indexed with a different embedding model (or unknown model)
  const getMismatchedDocs = () => allDocs.filter(
    d => d.index_status?.status === 'indexed' &&
         d.index_status.embedding_model !== currentEmbeddingModel
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

  // Index all pending (or specified) documents in the folder
  const handleIndexAll = async (docsOverride) => {
    if (!adapter || !isConnected || isDemoMode) {
      showToast({ message: 'Storage connection required for indexing', type: 'warning' })
      return
    }

    if (isIndexing) {
      showToast({ message: 'Indexing already in progress', type: 'info' })
      return
    }

    const docsToIndex = docsOverride || getPendingDocs()

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

  const handleUploadComplete = async ({ file, metadata, userTags, folderId }) => {
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
        tags: userTags || []
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

  // Build collection view title
  const getCollectionViewTitle = () => {
    if (selectedCollections.length === 0) return ''
    const collectionNames = selectedCollections.map(slug => collectionRegistry[slug]?.displayName || slug)
    const connector = collectionFilterMode === 'AND' ? ' & ' : ' | '
    return collectionNames.join(connector)
  }

  if (!folder && !isTagView && !isCollectionView) {
    return (
      <div className={styles.docList}>
        <div className={styles.empty}>Select a folder, collection, or tag</div>
      </div>
    )
  }

  return (
    <div className={styles.docList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          {/* Mobile back button - close doclist and show sidebar */}
          {isMobile && (
            <button
              className={styles.backBtn}
              onClick={() => {
                setDocListCollapsed(true)
                setSidebarCollapsed(false)
              }}
              aria-label="Back to library"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div className={styles.breadcrumb}>
          {isCollectionView ? (
            <span className={styles.collectionViewTitle}>
              <svg className={styles.viewIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              {getCollectionViewTitle()}
            </span>
          ) : isTagView ? (
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
          {/* Mobile close button or desktop collapse button */}
          {isMobile ? (
            <button
              className={styles.closeBtn}
              onClick={closeAllOverlays}
              aria-label="Close document list"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          ) : (
            <button
              className={styles.collapseBtn}
              onClick={toggleDocList}
              title="Collapse document list"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="11 17 6 12 11 7"/>
                <polyline points="18 17 13 12 18 7"/>
              </svg>
            </button>
          )}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.docCount}>{allDocs.length} documents</span>
          <div className={styles.headerActions}>
            {!selectionMode && !isTagView && !isCollectionView && (
              <button
                className={styles.addBtn}
                onClick={() => setShowUpload(!showUpload)}
              >
                {showUpload ? '✕ Cancel' : '+ Add'}
              </button>
            )}
            <button
              className={styles.selectBtn}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? 'Done' : 'Select'}
            </button>
            {selectionMode && (
              <button
                className={styles.selectAllBtn}
                onClick={() => selectAllVisible(filteredDocs.map(d => d.id))}
              >
                Select All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active tag filters */}
      <ActiveFilters />

      {/* Bulk actions bar */}
      {selectionMode && <BulkActionsBar />}

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
            <DocCard
              key={doc.id}
              doc={doc}
              selectionMode={selectionMode}
              isSelected={selectedDocIds.includes(doc.id)}
            />
          ))
        )}
      </div>

      {/* Indexing bar */}
      <IndexingBar
        pendingDocs={getPendingDocs()}
        mismatchedDocs={getMismatchedDocs()}
        onIndexAll={handleIndexAll}
        onReindexMismatched={() => handleIndexAll(getMismatchedDocs())}
      />
    </div>
  )
}
