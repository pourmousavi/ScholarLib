import { useState, useRef, useMemo, memo, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useUIStore } from '../../store/uiStore'
import { useIndexStore } from '../../store/indexStore'
import { useAIStore } from '../../store/aiStore'
import { useToast } from '../../hooks/useToast'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { settingsService } from '../../services/settings/SettingsService'
import { collectionService } from '../../services/tags/CollectionService'
import { AnnotationService } from '../../services/annotations'
import { StatusDot, Tag, ContextMenu, EditIcon, MoveIcon, DuplicateIcon, CheckIcon, CircleIcon, StarIcon, StarFilledIcon, TrashIcon, RefreshIcon, TagIcon, FolderIcon, ExportIcon, LinkIcon, DownloadIcon } from '../ui'
import QuickTagModal from './QuickTagModal'
import AddToCollectionModal from './AddToCollectionModal'
import styles from './DocCard.module.css'

const DocCard = memo(function DocCard({ doc, selectionMode = false, isSelected: isSelectedForBulk = false }) {
  const [contextMenu, setContextMenu] = useState(null)
  const [isReindexing, setIsReindexing] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [showAddToCollectionModal, setShowAddToCollectionModal] = useState(false)
  const attachInputRef = useRef(null)
  const replaceInputRef = useRef(null)

  // Display settings
  const showTags = settingsService.getShowTags()
  const showKeywords = settingsService.getShowKeywords()
  const showCollections = settingsService.getShowCollections?.() ?? true

  const isIndexing = useIndexStore((s) => s.isIndexing)
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const setSelectedDocId = useLibraryStore((s) => s.setSelectedDocId)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const removeDocument = useLibraryStore((s) => s.removeDocument)
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const collectionRegistry = useLibraryStore((s) => s.collectionRegistry)
  const selectCollectionFilter = useLibraryStore((s) => s.selectCollectionFilter)
  const toggleDocSelection = useLibraryStore((s) => s.toggleDocSelection)
  const removeDocFromCollection = useLibraryStore((s) => s.removeDocFromCollection)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const setShowModal = useUIStore((s) => s.setShowModal)
  const setExportDocs = useUIStore((s) => s.setExportDocs)
  const closeDocListMobile = useUIStore((s) => s.closeDocListMobile)

  const { showToast } = useToast()

  // Helper to save library after updates
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const library = useLibraryStore.getState().getLibrarySnapshot()
      await LibraryService.saveLibrary(adapter, library)
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  const embeddingProvider = useAIStore((s) => s.embeddingProvider)

  const isSelected = selectedDocId === doc.id
  const isUnread = !doc.user_data?.read
  const isStarred = doc.user_data?.starred

  // Determine index status — distinguish "indexed with wrong model" from "indexed and ready"
  const EMBEDDING_MODEL_NAMES = {
    gemini: 'gemini-embedding-001',
    openai: 'text-embedding-3-small',
    ollama: 'nomic-embed-text',
    browser: 'all-MiniLM-L6-v2'
  }
  const currentEmbeddingModel = EMBEDDING_MODEL_NAMES[embeddingProvider] || 'all-MiniLM-L6-v2'
  const rawStatus = doc.index_status?.status || 'none'
  const status = rawStatus === 'indexed' && doc.index_status?.embedding_model !== currentEmbeddingModel
    ? 'mismatched'
    : rawStatus

  const authors = doc.metadata?.authors || []
  const authorText = authors.length > 0
    ? authors.map(a => a.last).join(', ')
    : 'Unknown authors'

  const year = doc.metadata?.year || ''
  const journal = doc.metadata?.journal || ''
  const yearJournal = [year, journal].filter(Boolean).join(' · ')

  const tags = doc.user_data?.tags || []
  const keywords = doc.metadata?.keywords || []

  // Get collections this document belongs to (based on its tags)
  const docCollections = useMemo(() => {
    return collectionService.getCollectionsForDocument(collectionRegistry, doc)
  }, [collectionRegistry, doc])

  const handleClick = () => {
    if (selectionMode) {
      toggleDocSelection(doc.id)
    } else {
      setSelectedDocId(doc.id)
      // On mobile, auto-close doclist to show PDF
      if (window.innerWidth < 640) {
        closeDocListMobile()
      }
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleToggleRead = async () => {
    updateDocument(doc.id, {
      user_data: {
        ...doc.user_data,
        read: isUnread,  // If unread, mark as read (true); if read, mark as unread (false)
        read_at: isUnread ? new Date().toISOString() : null
      }
    })
    showToast({ message: isUnread ? 'Marked as read' : 'Marked as unread', type: 'success' })
    await saveLibrary()
  }

  const handleToggleStar = async () => {
    updateDocument(doc.id, {
      user_data: {
        ...doc.user_data,
        starred: !isStarred
      }
    })
    showToast({ message: isStarred ? 'Removed from starred' : 'Added to starred', type: 'success' })
    await saveLibrary()
  }

  const handleEditMetadata = () => {
    setSelectedDocId(doc.id)
    setShowModal('metadata')
  }

  const handleMoveToFolder = () => {
    setSelectedDocId(doc.id)
    setShowModal('move')
  }

  const handleDuplicate = async () => {
    // Generate a new ID for the duplicate
    const newId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Create duplicate document with new ID
    const duplicateDoc = {
      ...doc,
      id: newId,
      added_at: new Date().toISOString(),
      metadata: {
        ...doc.metadata,
        title: doc.metadata?.title ? `${doc.metadata.title} (copy)` : `${doc.filename} (copy)`
      },
      user_data: {
        ...doc.user_data,
        read: false,
        starred: false,
        read_at: null
      },
      index_status: {
        status: 'pending',
        indexed_at: null,
        chunk_count: 0
      }
    }

    // Add to library store
    const addDocument = useLibraryStore.getState().addDocument
    addDocument(duplicateDoc)

    // Save to storage
    await saveLibrary()

    showToast({ message: 'Document duplicated', type: 'success' })
  }

  const handleDelete = async () => {
    if (confirm(`Delete "${doc.metadata?.title || doc.filename}"? This cannot be undone.`)) {
      removeDocument(doc.id)
      await saveLibrary()
      showToast({ message: 'Document deleted', type: 'success' })
    }
  }

  const handleReindex = async () => {
    const { isIndexing, startIndexing, setProgress, completeIndexing, failIndexing } = useIndexStore.getState()

    if (isReindexing || isIndexing || isDemoMode || !adapter) return

    const path = doc.box_path
    if (!path) {
      showToast({ message: 'Attach a PDF first to enable AI indexing', type: 'error' })
      return
    }

    setIsReindexing(true)
    const docName = doc.metadata?.title || doc.filename || 'document'
    startIndexing(doc.id, docName)

    try {
      // Get PDF URL
      const pdfUrl = await adapter.getFileStreamURL(path)

      // Re-index the document
      await indexService.indexDocument(doc.id, pdfUrl, adapter, (progress) => {
        setProgress(progress)
      })

      completeIndexing(doc.id)
      showToast({ message: 'Document re-indexed successfully', type: 'success' })
    } catch (error) {
      console.error('Re-indexing failed:', error)
      failIndexing(doc.id, error)
      showToast({ message: error.message || 'Re-indexing failed', type: 'error' })
    } finally {
      setIsReindexing(false)
    }
  }

  const handleManageTags = () => {
    setShowTagModal(true)
    handleCloseContextMenu()
  }

  const handleAddToCollection = () => {
    setShowAddToCollectionModal(true)
    handleCloseContextMenu()
  }

  const handleExportCitation = () => {
    setExportDocs([doc.id], 'document')
    setShowModal('export-citations')
    handleCloseContextMenu()
  }

  const handleDownloadPdf = async () => {
    handleCloseContextMenu()
    if (!adapter || !doc.box_path) return

    try {
      showToast({ message: 'Downloading...', type: 'info' })
      const blob = await adapter.downloadFile(doc.box_path)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.filename || doc.metadata?.title?.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) + '.pdf' || 'document.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download PDF:', error)
      showToast({ message: 'Failed to download PDF', type: 'error' })
    }
  }

  const handleAttachPdf = () => {
    handleCloseContextMenu()
    if (isDemoMode || !adapter) {
      showToast({ message: 'Connect to storage first', type: 'error' })
      return
    }
    attachInputRef.current?.click()
  }

  const handleAttachFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so re-selecting same file triggers change
    e.target.value = ''

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast({ message: 'Only PDF files are supported', type: 'error' })
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      showToast({ message: 'File must be under 200MB', type: 'error' })
      return
    }

    // Sanitize filename from doc title or use original
    const title = doc.metadata?.title
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
      const result = await LibraryService.attachPdf(adapter, library, doc.id, file, filename)
      updateDocument(doc.id, {
        box_path: result.box_path,
        box_file_id: result.box_file_id,
        filename: result.filename
      })
      showToast({ message: 'PDF attached successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to attach PDF:', error)
      showToast({ message: 'Failed to attach PDF', type: 'error' })
    }
  }

  const handleReplacePdf = () => {
    handleCloseContextMenu()
    if (isDemoMode || !adapter) {
      showToast({ message: 'Connect to storage first', type: 'error' })
      return
    }
    const isIndexed = doc.index_status?.status === 'indexed'
    const message = isIndexed
      ? 'Replace PDF? This will remove all annotations, highlights, and AI index data for this document. This cannot be undone.'
      : 'Replace PDF? This will remove any annotations and highlights on this document. This cannot be undone.'
    if (!confirm(message)) return
    replaceInputRef.current?.click()
  }

  const handleReplaceFileSelected = async (e) => {
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

    const title = doc.metadata?.title
    const sanitized = title ? title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 80) : ''
    const filename = sanitized ? sanitized + '.pdf' : file.name

    try {
      // Upload replacement PDF first (so failure doesn't destroy existing data)
      const state = useLibraryStore.getState()
      const library = {
        version: '1.1',
        folders: state.folders,
        documents: { ...state.documents },
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections
      }
      const result = await LibraryService.replacePdf(adapter, library, doc.id, file, filename)

      // Upload succeeded — now safe to clear annotations and index
      AnnotationService.clearDocAnnotations(doc.id)
      await AnnotationService.flushSave(adapter)

      if (doc.index_status?.status === 'indexed') {
        await indexService.removeDocumentIndex(doc.id, adapter)
      }

      updateDocument(doc.id, {
        box_path: result.box_path,
        box_file_id: result.box_file_id,
        filename: result.filename,
        index_status: result.index_status
      })
      showToast({ message: 'PDF replaced successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to replace PDF:', error)
      showToast({ message: 'Failed to replace PDF', type: 'error' })
    }
  }

  const handleRemoveFromCollection = async (collectionSlug, collectionName) => {
    const result = removeDocFromCollection(collectionSlug, doc.id)
    if (result.error) {
      showToast({ message: result.error, type: 'error' })
    } else {
      showToast({ message: `Removed from "${collectionName}"`, type: 'success' })
      await saveLibrary()
    }
    handleCloseContextMenu()
  }

  // Build collection removal menu items
  const collectionRemovalItems = docCollections.length > 0
    ? [
        { separator: true },
        ...docCollections.map(collection => ({
          label: `Remove from "${collection.displayName}"`,
          icon: <FolderIcon />,
          onClick: () => handleRemoveFromCollection(collection.slug, collection.displayName)
        }))
      ]
    : []

  const hasPdf = !!doc.box_path

  const contextMenuItems = [
    {
      label: 'Edit metadata...',
      icon: <EditIcon />,
      onClick: handleEditMetadata
    },
    ...(!hasPdf ? [{
      label: 'Attach PDF...',
      icon: <LinkIcon />,
      onClick: handleAttachPdf
    }] : [{
      label: 'Replace PDF...',
      icon: <RefreshIcon />,
      onClick: handleReplacePdf
    }]),
    {
      label: 'Manage tags...',
      icon: <TagIcon />,
      onClick: handleManageTags
    },
    {
      label: 'Add to collection...',
      icon: <FolderIcon />,
      onClick: handleAddToCollection
    },
    ...collectionRemovalItems,
    { separator: true },
    {
      label: 'Export citation...',
      icon: <ExportIcon />,
      onClick: handleExportCitation
    },
    ...(hasPdf ? [{
      label: 'Download PDF',
      icon: <DownloadIcon />,
      onClick: handleDownloadPdf
    }] : []),
    { separator: true },
    {
      label: 'Move to folder...',
      icon: <MoveIcon />,
      onClick: handleMoveToFolder
    },
    {
      label: 'Duplicate',
      icon: <DuplicateIcon />,
      onClick: handleDuplicate
    },
    { separator: true },
    {
      label: isUnread ? 'Mark as read' : 'Mark as unread',
      icon: isUnread ? <CheckIcon /> : <CircleIcon />,
      onClick: handleToggleRead
    },
    {
      label: isStarred ? 'Remove star' : 'Add star',
      icon: isStarred ? <StarFilledIcon /> : <StarIcon />,
      onClick: handleToggleStar
    },
    { separator: true },
    {
      label: isReindexing || isIndexing ? 'Indexing in progress...' : 'Re-index for AI',
      icon: <RefreshIcon />,
      onClick: handleReindex,
      disabled: isReindexing || isIndexing || isDemoMode
    },
    { separator: true },
    {
      label: 'Delete...',
      icon: <TrashIcon />,
      onClick: handleDelete,
      danger: true
    }
  ]

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const title = doc.metadata?.title || doc.filename

  return (
    <>
      <article
        className={`${styles.card} ${isSelected ? styles.selected : ''} ${isSelectedForBulk ? styles.bulkSelected : ''}`}
        onClick={handleClick}
        onContextMenu={selectionMode ? undefined : handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-selected={isSelected || isSelectedForBulk}
        aria-label={`${title} by ${authorText}${isUnread ? ', unread' : ''}${isStarred ? ', starred' : ''}`}
      >
        <div className={styles.header}>
          {selectionMode && (
            <input
              type="checkbox"
              className={styles.selectCheckbox}
              checked={isSelectedForBulk}
              onChange={() => toggleDocSelection(doc.id)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <StatusDot status={status} />
          <h3 className={`${styles.title} ${isUnread ? styles.unread : ''}`}>
            {title}
          </h3>
          {hasPdf
            ? <span className={styles.pdfIcon} title="PDF attached" aria-hidden="true">
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <path d="M7 1H2.5A1.5 1.5 0 001 2.5v9A1.5 1.5 0 002.5 13h7a1.5 1.5 0 001.5-1.5V4.5L7 1z"/>
                  <polyline points="7 1 7 4.5 10.5 4.5"/>
                </svg>
              </span>
            : <span className={styles.noPdfBadge} title="No PDF attached">metadata only</span>
          }
          {isStarred && <span className={styles.star} aria-hidden="true"><StarFilledIcon /></span>}
        </div>
        <div className={styles.authors}>{authorText}</div>
        {yearJournal && (
          <div className={styles.meta}>
            {yearJournal}
            {doc.import_source?.type === 'litorbit' && (
              <span className={styles.originBadge}>LitOrbit</span>
            )}
          </div>
        )}
        {!yearJournal && doc.import_source?.type === 'litorbit' && (
          <div className={styles.meta}>
            <span className={styles.originBadge}>LitOrbit</span>
          </div>
        )}
        {/* Tags (user-assigned) */}
        {showTags && tags.length > 0 && (
          <div className={styles.tags} aria-label={`Tags: ${tags.map(t => tagRegistry[t]?.displayName || t).join(', ')}`}>
            {tags.slice(0, 3).map((slug) => {
              const tagData = tagRegistry[slug]
              return (
                <Tag
                  key={slug}
                  label={tagData?.displayName || slug}
                  color={tagData?.color}
                />
              )
            })}
            {tags.length > 3 && (
              <span className={styles.moreTags}>+{tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Keywords (from paper metadata) */}
        {showKeywords && keywords.length > 0 && (
          <div className={styles.keywords} aria-label={`Keywords: ${keywords.join(', ')}`}>
            {keywords.slice(0, 4).map((kw, idx) => (
              <span key={idx} className={styles.keyword}>{kw}</span>
            ))}
            {keywords.length > 4 && (
              <span className={styles.moreKeywords}>+{keywords.length - 4}</span>
            )}
          </div>
        )}

        {/* Collection footer */}
        {showCollections && docCollections.length > 0 && (
          <div
            className={styles.collectionFooter}
            onClick={(e) => {
              e.stopPropagation()
              selectCollectionFilter(docCollections[0].slug)
            }}
            role="button"
            tabIndex={-1}
            aria-label={`Collections: ${docCollections.map(c => c.displayName).join(', ')}`}
          >
            {docCollections.slice(0, 3).map((collection, idx) => (
              <span
                key={collection.slug}
                className={styles.collectionDot}
                style={{ backgroundColor: collection.color || 'var(--accent)' }}
                title={collection.displayName}
              />
            ))}
            <span className={styles.collectionNames}>
              {docCollections.map(c => c.displayName).join(', ')}
            </span>
          </div>
        )}
      </article>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseContextMenu}
        />
      )}

      {showTagModal && (
        <QuickTagModal
          docId={doc.id}
          onClose={() => setShowTagModal(false)}
        />
      )}

      {showAddToCollectionModal && (
        <AddToCollectionModal
          docId={doc.id}
          onClose={() => setShowAddToCollectionModal(false)}
        />
      )}

      <input
        ref={attachInputRef}
        type="file"
        accept=".pdf"
        onChange={handleAttachFileSelected}
        style={{ display: 'none' }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf"
        onChange={handleReplaceFileSelected}
        style={{ display: 'none' }}
      />
    </>
  )
})

export default DocCard
