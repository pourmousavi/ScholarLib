import { useAIStore } from '../../store/aiStore'
import { useLibraryStore } from '../../store/libraryStore'
import styles from './ScopeSelector.module.css'

export default function ScopeSelector() {
  const scope = useAIStore((s) => s.scope)
  const setScopeType = useAIStore((s) => s.setScopeType)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const documents = useLibraryStore((s) => s.documents)
  const folders = useLibraryStore((s) => s.folders)

  // Count docs in current folder
  const folderDocCount = Object.values(documents).filter(
    d => d.folder_id === selectedFolderId
  ).length

  // Total library doc count
  const totalDocCount = Object.keys(documents).length

  const handleScopeChange = (type) => {
    setScopeType(type, selectedDocId, selectedFolderId)
  }

  return (
    <div className={styles.selector}>
      <button
        className={`${styles.option} ${scope.type === 'document' ? styles.active : ''}`}
        onClick={() => handleScopeChange('document')}
        disabled={!selectedDocId}
        title={!selectedDocId ? 'Select a document first' : 'Search within current document'}
      >
        This doc
      </button>
      <button
        className={`${styles.option} ${scope.type === 'folder' ? styles.active : ''}`}
        onClick={() => handleScopeChange('folder')}
        disabled={!selectedFolderId}
        title="Search within current folder"
      >
        Folder ({folderDocCount})
      </button>
      <button
        className={`${styles.option} ${scope.type === 'library' ? styles.active : ''}`}
        onClick={() => handleScopeChange('library')}
        title="Search entire library"
      >
        All ({totalDocCount})
      </button>
    </div>
  )
}
