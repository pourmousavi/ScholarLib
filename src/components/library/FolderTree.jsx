import { useLibraryStore } from '../../store/libraryStore'
import styles from './FolderTree.module.css'

export default function FolderTree() {
  const folders = useLibraryStore((s) => s.folders)
  const rootFolders = folders
    .filter(f => f.parent_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)

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
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)
  const expandedFolders = useLibraryStore((s) => s.expandedFolders)
  const setSelectedFolderId = useLibraryStore((s) => s.setSelectedFolderId)
  const toggleFolderExpanded = useLibraryStore((s) => s.toggleFolderExpanded)

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
