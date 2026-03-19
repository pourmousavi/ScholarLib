import { useLibraryStore } from '../../store/libraryStore'
import styles from './FolderTree.module.css'

export default function FolderTree() {
  const rootFolders = useLibraryStore((s) => s.getRootFolders())

  return (
    <div className={styles.tree}>
      <div className={styles.sectionLabel}>COLLECTIONS</div>
      {rootFolders.map((folder) => (
        <FolderNode key={folder.id} folder={folder} depth={0} />
      ))}
    </div>
  )
}

function FolderNode({ folder, depth }) {
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const expandedFolders = useLibraryStore((s) => s.expandedFolders)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)
  const toggleFolderExpanded = useLibraryStore((s) => s.toggleFolderExpanded)
  const getChildFolders = useLibraryStore((s) => s.getChildFolders)
  const getDocCountForFolder = useLibraryStore((s) => s.getDocCountForFolder)

  const isSelected = selectedFolderId === folder.id
  const isExpanded = expandedFolders.includes(folder.id)
  const hasChildren = folder.children && folder.children.length > 0
  const childFolders = hasChildren ? getChildFolders(folder.id) : []
  const docCount = getDocCountForFolder(folder.id)

  const handleClick = () => {
    setSelectedFolderId(folder.id)
  }

  const handleToggle = (e) => {
    e.stopPropagation()
    toggleFolderExpanded(folder.id)
  }

  return (
    <div className={styles.node}>
      <div
        className={`${styles.item} ${isSelected ? styles.selected : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={handleClick}
      >
        <button
          className={styles.toggle}
          onClick={handleToggle}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
        <span className={styles.name}>{folder.name}</span>
        <span className={styles.count}>{docCount}</span>
      </div>
      {isExpanded && childFolders.map((child) => (
        <FolderNode key={child.id} folder={child} depth={depth + 1} />
      ))}
    </div>
  )
}
