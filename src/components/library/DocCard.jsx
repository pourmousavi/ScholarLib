import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useUIStore } from '../../store/uiStore'
import { useToast } from '../../hooks/useToast'
import { StatusDot, Tag, ContextMenu } from '../ui'
import styles from './DocCard.module.css'

export default function DocCard({ doc }) {
  const [contextMenu, setContextMenu] = useState(null)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const setSelectedDocId = useLibraryStore((s) => s.setSelectedDocId)
  const updateDocument = useLibraryStore((s) => s.updateDocument)
  const removeDocument = useLibraryStore((s) => s.removeDocument)

  const setShowModal = useUIStore((s) => s.setShowModal)

  const { showToast } = useToast()

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

  const handleToggleRead = () => {
    updateDocument(doc.id, {
      user_data: {
        ...doc.user_data,
        read: !isUnread
      }
    })
    showToast({ message: isUnread ? 'Marked as read' : 'Marked as unread', type: 'success' })
  }

  const handleToggleStar = () => {
    updateDocument(doc.id, {
      user_data: {
        ...doc.user_data,
        starred: !isStarred
      }
    })
    showToast({ message: isStarred ? 'Removed from starred' : 'Added to starred', type: 'success' })
  }

  const handleEditMetadata = () => {
    setSelectedDocId(doc.id)
    setShowModal('metadata')
  }

  const handleMoveToFolder = () => {
    setSelectedDocId(doc.id)
    setShowModal('move')
  }

  const handleDuplicate = () => {
    showToast({ message: 'Duplicate not implemented yet', type: 'info' })
  }

  const handleDelete = () => {
    if (confirm(`Delete "${doc.metadata?.title || doc.filename}"? This cannot be undone.`)) {
      removeDocument(doc.id)
      showToast({ message: 'Document deleted', type: 'success' })
    }
  }

  const contextMenuItems = [
    {
      label: 'Edit metadata...',
      icon: '/',
      onClick: handleEditMetadata
    },
    {
      label: 'Move to folder...',
      icon: '>',
      onClick: handleMoveToFolder
    },
    {
      label: 'Duplicate',
      icon: '+',
      onClick: handleDuplicate
    },
    { separator: true },
    {
      label: isUnread ? 'Mark as read' : 'Mark as unread',
      icon: isUnread ? 'v' : 'o',
      onClick: handleToggleRead
    },
    {
      label: isStarred ? 'Remove star' : 'Add star',
      icon: '*',
      onClick: handleToggleStar
    },
    { separator: true },
    {
      label: 'Delete...',
      icon: 'x',
      onClick: handleDelete,
      danger: true
    }
  ]

  return (
    <>
      <div
        className={`${styles.card} ${isSelected ? styles.selected : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className={styles.header}>
          <StatusDot status={status} />
          <h3 className={`${styles.title} ${isUnread ? styles.unread : ''}`}>
            {doc.metadata?.title || doc.filename}
          </h3>
          {isStarred && <span className={styles.star}>*</span>}
        </div>
        <div className={styles.authors}>{authorText}</div>
        {yearJournal && (
          <div className={styles.meta}>{yearJournal}</div>
        )}
        {tags.length > 0 && (
          <div className={styles.tags}>
            {tags.slice(0, 3).map((tag) => (
              <Tag key={tag} label={tag} />
            ))}
            {tags.length > 3 && (
              <span className={styles.moreTags}>+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

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
}
