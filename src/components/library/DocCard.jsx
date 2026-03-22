import { useState, memo, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useUIStore } from '../../store/uiStore'
import { useIndexStore } from '../../store/indexStore'
import { useToast } from '../../hooks/useToast'
import { LibraryService } from '../../services/library/LibraryService'
import { indexService } from '../../services/indexing/IndexService'
import { StatusDot, Tag, ContextMenu, EditIcon, MoveIcon, DuplicateIcon, CheckIcon, CircleIcon, StarIcon, StarFilledIcon, TrashIcon, RefreshIcon } from '../ui'
import styles from './DocCard.module.css'

const DocCard = memo(function DocCard({ doc }) {
  const [contextMenu, setContextMenu] = useState(null)
  const [isReindexing, setIsReindexing] = useState(false)

  const isIndexing = useIndexStore((s) => s.isIndexing)
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const setSelectedDocId = useLibraryStore((s) => s.setSelectedDocId)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const removeDocument = useLibraryStore((s) => s.removeDocument)
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const setShowModal = useUIStore((s) => s.setShowModal)

  const { showToast } = useToast()

  // Helper to save library after updates
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const { folders, documents } = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, { version: '1.0', folders, documents })
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  const isSelected = selectedDocId === doc.id
  const isUnread = !doc.user_data?.read
  const isStarred = doc.user_data?.starred
  const status = doc.index_status?.status || 'none'

  const authors = doc.metadata?.authors || []
  const authorText = authors.length > 0
    ? authors.map(a => a.last).join(', ')
    : 'Unknown authors'

  const year = doc.metadata?.year || ''
  const journal = doc.metadata?.journal || ''
  const yearJournal = [year, journal].filter(Boolean).join(' · ')

  const tags = doc.user_data?.tags || []

  const handleClick = () => {
    setSelectedDocId(doc.id)
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
      showToast({ message: 'Document has no file path', type: 'error' })
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

  const contextMenuItems = [
    {
      label: 'Edit metadata...',
      icon: <EditIcon />,
      onClick: handleEditMetadata
    },
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
        className={`${styles.card} ${isSelected ? styles.selected : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-selected={isSelected}
        aria-label={`${title} by ${authorText}${isUnread ? ', unread' : ''}${isStarred ? ', starred' : ''}`}
      >
        <div className={styles.header}>
          <StatusDot status={status} />
          <h3 className={`${styles.title} ${isUnread ? styles.unread : ''}`}>
            {title}
          </h3>
          {isStarred && <span className={styles.star} aria-hidden="true">*</span>}
        </div>
        <div className={styles.authors}>{authorText}</div>
        {yearJournal && (
          <div className={styles.meta}>{yearJournal}</div>
        )}
        {tags.length > 0 && (
          <div className={styles.tags} aria-label={`Tags: ${tags.join(', ')}`}>
            {tags.slice(0, 3).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}
            {tags.length > 3 && (
              <span className={styles.moreTags}>+{tags.length - 3}</span>
            )}
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
    </>
  )
})

export default DocCard
