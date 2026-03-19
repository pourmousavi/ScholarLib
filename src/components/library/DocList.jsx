import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import DocCard from './DocCard'
import PendingNotice from './PendingNotice'
import styles from './DocList.module.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'pending', label: 'Pending' }
]

export default function DocList() {
  const [activeFilter, setActiveFilter] = useState('all')
  const folders = useLibraryStore((s) => s.folders)
  const documents = useLibraryStore((s) => s.documents)
  const selectedFolderId = useLibraryStore((s) => s.selectedFolderId)

  const folder = folders.find(f => f.id === selectedFolderId)

  // Get all docs for the selected folder
  const allDocs = Object.values(documents)
    .filter(d => d.folder_id === selectedFolderId)
    .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))

  // Apply filter
  const filteredDocs = allDocs.filter(doc => {
    switch (activeFilter) {
      case 'unread':
        return !doc.user_data?.read
      case 'starred':
        return doc.user_data?.starred
      case 'pending':
        return doc.index_status?.status === 'pending' || doc.index_status?.status === 'processing'
      default:
        return true
    }
  })

  // Count pending docs
  const pendingCount = allDocs.filter(
    d => d.index_status?.status === 'pending' || d.index_status?.status === 'processing'
  ).length

  // Build breadcrumb
  const breadcrumb = []
  let current = folder
  while (current) {
    breadcrumb.unshift(current)
    current = current.parent_id ? folders.find(f => f.id === current.parent_id) : null
  }

  const handleIndexNow = () => {
    // Will be implemented in Stage 11
    console.log('Index now clicked')
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
          <span className={styles.docCount}>{allDocs.length} documents</span>
          <button className={styles.addBtn}>+ Add</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className={styles.filters}>
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={`${styles.filter} ${activeFilter === filter.id ? styles.active : ''}`}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className={styles.list}>
        {filteredDocs.length === 0 ? (
          <div className={styles.emptyList}>
            {activeFilter === 'all'
              ? 'No documents in this folder'
              : `No ${activeFilter} documents`}
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))
        )}
      </div>

      {/* Pending notice */}
      <PendingNotice count={pendingCount} onIndexNow={handleIndexNow} />
    </div>
  )
}
