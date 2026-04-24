import { useState, memo, useCallback, useEffect, useRef } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useUIStore } from '../../store/uiStore'
import { useIndexStore } from '../../store/indexStore'
import { useToast } from '../../hooks/useToast'
import { indexService } from '../../services/indexing/IndexService'
import { ContextMenu, ShareIcon, LinkIcon, UsersIcon, RenameIcon, UnshareIcon, FolderMinusIcon, ExportIcon, RefreshIcon } from '../ui'
import styles from './FolderTree.module.css'

export default function FolderTree() {
  const [collapsed, setCollapsed] = useState(false)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const setShowModal = useUIStore((s) => s.setShowModal)

  const rootFolders = folders
    .filter(f => f.parent_id === null)
    .sort((a, b) => a.name.localeCompare(b.name))

  const folderCount = folders.length
  const docCount = Object.keys(documents).length

  return (
    <nav className={styles.tree} aria-label="Folder navigation">
      <div className={styles.headerRow}>
        <button
          className={styles.header}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
          <span className={styles.headerTitle}>Folders</span>
          <span className={styles.headerCount}>{folderCount}</span>
        </button>
        <div className={styles.headerActions}>
          <button
            className={styles.actionBtn}
            onClick={() => setShowModal('new-folder')}
            title="Create new folder"
          >
            +
          </button>
        </div>
      </div>
      {!collapsed && (
        <div role="tree" aria-labelledby="folders-label" className={styles.foldersList}>
          {rootFolders.map((folder) => (
            <FolderNode key={folder.id} folder={folder} depth={0} />
          ))}
          {rootFolders.length === 0 && (
            <div className={styles.emptyState}>
              <p>No folders yet</p>
              <button
                className={styles.createFirstBtn}
                onClick={() => setShowModal('new-folder')}
              >
                + Create your first folder
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}

const FolderNode = memo(function FolderNode({ folder, depth }) {
  const [contextMenu, setContextMenu] = useState(null)
  const itemRef = useRef(null)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const expandedFolders = useLibraryStore((s) => s.expandedFolders)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)
  const toggleFolderExpanded = useLibraryStore((s) => s.toggleFolderExpanded)
  const removeFolder = useLibraryStore((s) => s.removeFolder)
  const updateFolder = useLibraryStore((s) => s.updateFolder)

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

  const setShowModal = useUIStore((s) => s.setShowModal)
  const showDocCounts = useUIStore((s) => s.showDocCounts)
  const setExportDocs = useUIStore((s) => s.setExportDocs)
  const showDocListMobile = useUIStore((s) => s.showDocListMobile)

  const { showToast } = useToast()

  // Helper to save library after updates
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      await useLibraryStore.getState().saveLibrary(adapter)
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  const isSelected = selectedFolderId === folder.id
  const isExpanded = expandedFolders.includes(folder.id)
  const hasChildren = folder.children && folder.children.length > 0

  // Scroll the restored/selected folder into view so a nested selection
  // isn't hidden below the fold after refresh. scrollIntoView with
  // block: 'nearest' is a no-op when already visible, so user clicks
  // on visible items don't jump the view.
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isSelected])

  const childFolders = hasChildren
    ? folders.filter(f => f.parent_id === folder.id).sort((a, b) => a.name.localeCompare(b.name))
    : []

  const docCount = Object.values(documents).filter(d => d.folder_id === folder.id).length

  const handleClick = () => {
    setSelectedFolderId(folder.id)
    // On mobile, auto-navigate to doc list after selecting folder
    if (window.innerWidth < 640) {
      showDocListMobile()
    }
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

  const handleExportCitations = () => {
    handleCloseContextMenu()
    // Get all document IDs in this folder
    const folderDocIds = Object.values(documents)
      .filter(d => d.folder_id === folder.id)
      .map(d => d.id)

    if (folderDocIds.length === 0) {
      showToast({ message: 'No documents in this folder to export', type: 'info' })
      return
    }

    setExportDocs(folderDocIds, 'folder')
    setShowModal('export-citations')
  }

  const handleDeleteFolder = async () => {
    handleCloseContextMenu()

    // Check for documents
    if (docCount > 0) {
      showToast({ message: 'Cannot delete folder with documents. Move or delete documents first.', type: 'warning' })
      return
    }

    // Check for child folders
    if (hasChildren) {
      showToast({ message: 'Cannot delete folder with subfolders. Delete subfolders first.', type: 'warning' })
      return
    }

    if (!confirm(`Delete folder "${folder.name}"? This cannot be undone.`)) {
      return
    }

    try {
      // Remove from parent's children array
      if (folder.parent_id) {
        const parentFolder = folders.find(f => f.id === folder.parent_id)
        if (parentFolder) {
          updateFolder(folder.parent_id, {
            children: parentFolder.children.filter(id => id !== folder.id)
          })
        }
      }

      // Remove the folder
      removeFolder(folder.id)

      // Clear selection if this folder was selected
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(folder.parent_id || null)
      }

      // Save to storage
      await saveLibrary()

      showToast({ message: 'Folder deleted', type: 'success' })
    } catch (error) {
      console.error('Failed to delete folder:', error)
      showToast({ message: 'Failed to delete folder', type: 'error' })
    }
  }

  const handleReindexFolder = async () => {
    handleCloseContextMenu()

    if (!adapter || !isConnected || isDemoMode) {
      showToast({ message: 'Storage connection required for indexing', type: 'warning' })
      return
    }

    if (isIndexing) {
      showToast({ message: 'Indexing already in progress', type: 'info' })
      return
    }

    const folderDocs = Object.entries(documents)
      .filter(([, d]) => d.folder_id === folder.id)
      .map(([id, d]) => ({ id, ...d }))

    if (folderDocs.length === 0) {
      showToast({ message: 'No documents in this folder', type: 'info' })
      return
    }

    if (!confirm(`Re-index all ${folderDocs.length} document${folderDocs.length !== 1 ? 's' : ''} in "${folder.name}"?`)) {
      return
    }

    startBatchIndexing(folderDocs.length)
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < folderDocs.length; i++) {
      const doc = folderDocs[i]
      updateBatchProgress(i)
      const docName = doc.metadata?.title || doc.filename || 'document'
      startIndexing(doc.id, docName)

      try {
        const pdfURL = await adapter.getFileStreamURL(doc.box_path)
        await indexService.indexDocument(doc.id, pdfURL, adapter, (progress) => {
          setProgress(progress)
        })
        completeIndexing(doc.id)
        successCount++
      } catch (error) {
        console.error(`Failed to re-index ${doc.id}:`, error)
        failIndexing(doc.id, error)
        failCount++
      }
    }

    completeBatchIndexing()

    if (failCount === 0) {
      showToast({ message: `Re-indexed ${successCount} document${successCount !== 1 ? 's' : ''}`, type: 'success' })
    } else {
      showToast({ message: `Re-indexed ${successCount}, ${failCount} failed`, type: 'warning' })
    }
  }

  // Check if folder is shared with anyone
  const isShared = folder.shared_with && folder.shared_with.length > 0
  const canDelete = docCount === 0 && !hasChildren

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
      label: 'Export all citations...',
      icon: <ExportIcon />,
      onClick: handleExportCitations,
      disabled: docCount === 0
    },
    {
      label: isIndexing ? 'Indexing in progress...' : 'Re-index all for AI',
      icon: <RefreshIcon />,
      onClick: handleReindexFolder,
      disabled: docCount === 0 || isIndexing || isDemoMode
    },
    // Only show "View who has access" if folder is shared
    ...(isShared ? [{
      label: 'View who has access',
      icon: <UsersIcon />,
      onClick: handleViewAccess
    }] : []),
    { separator: true },
    {
      label: 'Rename folder...',
      icon: <RenameIcon />,
      onClick: handleRenameFolder
    },
    // Only show "Unshare all" if folder is shared
    ...(isShared ? [{
      label: 'Unshare all',
      icon: <UnshareIcon />,
      onClick: handleUnshareAll
    }] : []),
    { separator: true },
    {
      label: canDelete ? 'Delete folder...' : (hasChildren ? 'Delete folder (has subfolders)' : 'Delete folder (has documents)'),
      icon: <FolderMinusIcon />,
      onClick: handleDeleteFolder,
      danger: true,
      disabled: !canDelete
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
          ref={itemRef}
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
            className={`${styles.toggle} ${isExpanded ? styles.expanded : ''}`}
            onClick={handleToggle}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            tabIndex={-1}
          >
            ▸
          </button>
          <span className={styles.name}>{folder.name}</span>
          {showDocCounts && (
            <span className={styles.count} aria-label={`${docCount} documents`}>{docCount}</span>
          )}
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
