import { useLibraryStore } from '../../store/libraryStore'
import { StatusDot, Tag } from '../ui'
import styles from './DocCard.module.css'

export default function DocCard({ doc }) {
  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const setSelectedDocId = useLibraryStore((s) => s.setSelectedDocId)

  const isSelected = selectedDocId === doc.id
  const isUnread = !doc.user_data?.read
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
    // Context menu will be implemented in Stage 14
  }

  return (
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
  )
}
