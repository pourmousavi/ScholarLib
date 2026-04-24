import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './MoveFolderPicker.module.css'

export default function MoveFolderPicker({ onClose }) {
  const [selectedTargetId, setSelectedTargetId] = useState(null)
  const [isMoving, setIsMoving] = useState(false)

  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const updateDocument = useLibraryStore((s) => s.updateDocument)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const { showToast } = useToast()

  const doc = selectedDocId ? documents[selectedDocId] : null
  const currentFolderId = doc?.folder_id

  const rootFolders = folders
    .filter(f => f.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)

  const handleMove = async () => {
    if (!selectedTargetId || selectedTargetId === currentFolderId) {
      onClose()
      return
    }

    setIsMoving(true)

    try {
      // Update in store
      updateDocument(selectedDocId, { folder_id: selectedTargetId })

      // Save to storage
      if (!isDemoMode && adapter) {
        await useLibraryStore.getState().saveLibrary(adapter)
      }

      const targetFolder = folders.find(f => f.id === selectedTargetId)
      showToast({ message: `Moved to "${targetFolder?.name}"`, type: 'success' })
      onClose()
    } catch (error) {
      console.error('Failed to move document:', error)
      showToast({ message: 'Failed to move document', type: 'error' })
    } finally {
      setIsMoving(false)
    }
  }

  if (!doc) {
    return (
      <Modal onClose={onClose} width={400}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2>Move Document</h2>
            <button className={styles.closeBtn} onClick={onClose}>x</button>
          </div>
          <div className={styles.empty}>No document selected</div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} width={400}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Move to folder</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Document info */}
        <div className={styles.docInfo}>
          Moving: <strong>{doc.metadata?.title || doc.filename}</strong>
        </div>

        {/* Folder tree */}
        <div className={styles.tree}>
          {rootFolders.map(folder => (
            <FolderOption
              key={folder.id}
              folder={folder}
              folders={folders}
              depth={0}
              selectedTargetId={selectedTargetId}
              currentFolderId={currentFolderId}
              onSelect={setSelectedTargetId}
            />
          ))}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isMoving}>
            Cancel
          </button>
          <button
            className={styles.moveBtn}
            onClick={handleMove}
            disabled={!selectedTargetId || selectedTargetId === currentFolderId || isMoving}
          >
            {isMoving ? 'Moving...' : 'Move here'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function FolderOption({ folder, folders, depth, selectedTargetId, currentFolderId, onSelect }) {
  const [expanded, setExpanded] = useState(true)

  const childFolders = folders
    .filter(f => f.parent_id === folder.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const hasChildren = childFolders.length > 0
  const isSelected = selectedTargetId === folder.id
  const isCurrent = currentFolderId === folder.id

  return (
    <div className={styles.node}>
      <div
        className={`${styles.option} ${isSelected ? styles.selected : ''} ${isCurrent ? styles.current : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => !isCurrent && onSelect(folder.id)}
      >
        {hasChildren && (
          <button
            className={styles.toggle}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? 'v' : '>'}
          </button>
        )}
        {!hasChildren && <span className={styles.toggleSpace} />}
        <span className={styles.name}>{folder.name}</span>
        {isCurrent && <span className={styles.currentLabel}>current</span>}
      </div>
      {expanded && childFolders.map(child => (
        <FolderOption
          key={child.id}
          folder={child}
          folders={folders}
          depth={depth + 1}
          selectedTargetId={selectedTargetId}
          currentFolderId={currentFolderId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
