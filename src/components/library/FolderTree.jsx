import { useState, memo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useUIStore } from '../../store/uiStore'
import { useToast } from '../../hooks/useToast'
import { ContextMenu, ShareIcon, LinkIcon, UsersIcon, RenameIcon, UnshareIcon, FolderMinusIcon } from '../ui'
import styles from './FolderTree.module.css'

export default function FolderTree() {
  const folders = useLibraryStore((s) => s.folders)
  const rootFolders = folders
    .filter(f => f.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)

  return (
    <nav className={styles.tree} aria-label="Folder navigation">
      <div className={styles.sectionLabel} id="collections-label">COLLECTIONS</div>
      <div role="tree" aria-labelledby="collections-label">
        {rootFolders.map((folder) => (
          <FolderNode key={folder.id} folder={folder} depth={0} />
        ))}
      </div>
    </nav>
  )
}

const FolderNode = memo(function FolderNode({ folder, depth }) {
  const [contextMenu, setContextMenu] = useState(null)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const expandedFolders = useLibraryStore((s) => s.expandedFolders)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)
  const toggleFolderExpanded = useLibraryStore((s) => s.toggleFolderExpanded)

  const setShowModal = useUIStore((s) => s.setShowModal)

  const { showToast } = useToast()

  const isSelected = selectedFolderId === folder.id
  const isExpanded = expandedFolders.includes(folder.id)
  const hasChildren = folder.children && folder.children.length > 0

  const childFolders = hasChildren
    ? folders.filter(f => f.parent_id === folder.id).sort((a, b) => a.sort_order - b.sort_order)
    : []

  const docCount = Object.values(documents).filter(d => d.folder_id === folder.id).length

  const handleClick = () => {
    setSelectedFolderId(folder.id)
  }

  const handleToggle = (e) => {
    e.stopPropagation()
    toggleFolderExpanded(folder.id)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleShareFolder = () => {
    handleCloseContextMenu()
    setSelectedFolderId(folder.id)
    setShowModal('share')
  }

  const handleCopySharingLink = async () => {
    handleCloseContextMenu()
    try {
      const url = `${window.location.origin}${window.location.pathname}?folder=${folder.slug}`
      await navigator.clipboard.writeText(url)
      showToast({ message: 'Sharing link copied', type: 'success' })
    } catch (err) {
      showToast({ message: 'Failed to copy link', type: 'error' })
    }
  }

  const handleViewAccess = () => {
    handleCloseContextMenu()
    setSelectedFolderId(folder.id)
    setShowModal('share')
  }

  const handleUnshareAll = () => {
    handleCloseContextMenu()
    showToast({ message: 'Unshare all not implemented yet', type: 'info' })
  }

  const handleRenameFolder = () => {
    handleCloseContextMenu()
    showToast({ message: 'Rename folder not implemented yet', type: 'info' })
  }

  const handleDeleteFolder = () => {
    handleCloseContextMenu()
    if (docCount > 0) {
      showToast({ message: 'Cannot delete folder with documents', type: 'warning' })
      return
    }
    if (confirm(`Delete folder "${folder.name}"?`)) {
      showToast({ message: 'Delete folder not implemented yet', type: 'info' })
    }
  }

  const contextMenuItems = [
    {
      label: 'Share folder...',
      icon: <ShareIcon />,
      onClick: handleShareFolder
    },
    {
      label: 'Copy sharing link',
      icon: <LinkIcon />,
      onClick: handleCopySharingLink
    },
    {
      label: 'View who has access',
      icon: <UsersIcon />,
      onClick: handleViewAccess
    },
    { separator: true },
    {
      label: 'Rename folder...',
      icon: <RenameIcon />,
      onClick: handleRenameFolder
    },
    {
      label: 'Unshare all',
      icon: <UnshareIcon />,
      onClick: handleUnshareAll
    },
    { separator: true },
    {
      label: 'Delete folder...',
      icon: <FolderMinusIcon />,
      onClick: handleDeleteFolder,
      danger: true,
      disabled: docCount > 0
    }
  ]

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      toggleFolderExpanded(folder.id)
    } else if (e.key === 'ArrowLeft' && hasChildren && isExpanded) {
      toggleFolderExpanded(folder.id)
    }
  }

  return (
    <>
      <div
        className={styles.node}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        aria-level={depth + 1}
      >
        <div
          className={`${styles.item} ${isSelected ? styles.selected : ''}`}
          style={{ paddingLeft: 12 + depth * 14 }}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-label={`${folder.name}, ${docCount} documents`}
        >
          <button
            className={styles.toggle}
            onClick={handleToggle}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            tabIndex={-1}
          >
            {isExpanded ? '>' : '>'}
          </button>
          <span className={styles.name}>{folder.name}</span>
          <span className={styles.count} aria-label={`${docCount} documents`}>{docCount}</span>
        </div>
        {isExpanded && (
          <div role="group">
            {childFolders.map((child) => (
              <FolderNode key={child.id} folder={child} depth={depth + 1} />
            ))}
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
})
