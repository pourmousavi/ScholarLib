import { useLibraryStore } from '../../store/libraryStore'
import styles from './DocList.module.css'

export default function DocList() {
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)

  const folder = folders.find(f => f.id === selectedFolderId)
  const docs = Object.values(documents).filter(d => d.folder_id === selectedFolderId)

  // Build breadcrumb
  const breadcrumb = []
  let current = folder
  while (current) {
    breadcrumb.unshift(current)
    current = current.parent_id ? folders.find(f => f.id === current.parent_id) : null
  }

  if (!folder) {
    return (
      <div className={styles.docList}>
        <div className={styles.empty}>Select a folder</div>
      </div>
    )
  }

  return (
    <div className={styles.docList}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          {breadcrumb.map((f, i) => (
            <span key={f.id}>
              {i > 0 && <span className={styles.separator}> › </span>}
              <span className={i === breadcrumb.length - 1 ? styles.current : ''}>
                {f.name}
              </span>
            </span>
          ))}
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.docCount}>{docs.length} documents</span>
          <button className={styles.addBtn}>+ Add</button>
        </div>
      </div>

      {/* Filter tabs - placeholder */}
      <div className={styles.filters}>
        <button className={`${styles.filter} ${styles.active}`}>All</button>
        <button className={styles.filter}>Unread</button>
        <button className={styles.filter}>Starred</button>
        <button className={styles.filter}>Pending</button>
      </div>

      {/* Document list - placeholder */}
      <div className={styles.list}>
        {docs.length === 0 ? (
          <div className={styles.empty}>No documents in this folder</div>
        ) : (
          <div className={styles.placeholder}>
            {docs.length} documents (cards built in Stage 04)
          </div>
        )}
      </div>
    </div>
  )
}
