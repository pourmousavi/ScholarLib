import { useState, useMemo } from 'react'
import Modal from '../ui/Modal'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './QuickTagModal.module.css'

/**
 * QuickTagModal - Quick tag assignment for a single document
 * Shows checkboxes for all tags with ability to create new ones
 */
export default function QuickTagModal({ docId, onClose }) {
  const [newTagName, setNewTagName] = useState('')
  const [search, setSearch] = useState('')

  const documents = useLibraryStore((s) => s.documents)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const addTagToDocument = useLibraryStore((s) => s.addTagToDocument)
  const removeTagFromDocument = useLibraryStore((s) => s.removeTagFromDocument)
  const createTag = useLibraryStore((s) => s.createTag)

  const doc = documents[docId]
  const docTags = doc?.user_data?.tags || []

  // Get all tags with counts
  const allTags = useMemo(() => {
    return tagService.getAllTagsWithCounts(tagRegistry, documents)
  }, [tagRegistry, documents])

  // Filter by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return allTags
    const q = search.toLowerCase()
    return allTags.filter(t =>
      t.displayName.toLowerCase().includes(q) ||
      t.slug.includes(q)
    )
  }, [allTags, search])

  const handleToggleTag = (slug) => {
    if (docTags.includes(slug)) {
      removeTagFromDocument(docId, slug)
    } else {
      addTagToDocument(docId, slug)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    const result = await createTag(newTagName.trim())
    if (!result.error) {
      // Also add the new tag to this document
      addTagToDocument(docId, result.slug)
      setNewTagName('')
    }
  }

  if (!doc) return null

  const title = doc.metadata?.title || doc.filename

  return (
    <Modal title="Manage Tags" onClose={onClose} width={400}>
      <div className={styles.container}>
        <h2 className={styles.title}>Manage Tags</h2>
        <p className={styles.docTitle} title={title}>
          {title.length > 60 ? title.slice(0, 60) + '...' : title}
        </p>

        {/* Create new tag */}
        <div className={styles.createSection}>
          <input
            type="text"
            className={styles.createInput}
            placeholder="Create new tag..."
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateTag()
            }}
          />
          <button
            className={styles.createBtn}
            onClick={handleCreateTag}
            disabled={!newTagName.trim()}
          >
            + Add
          </button>
        </div>

        {/* Search existing tags */}
        {allTags.length > 6 && (
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {/* Tag list */}
        <div className={styles.tagList}>
          {filteredTags.length === 0 ? (
            <div className={styles.empty}>
              {search ? 'No tags match your search' : 'No tags created yet'}
            </div>
          ) : (
            filteredTags.map(tag => (
              <label key={tag.slug} className={styles.tagOption}>
                <input
                  type="checkbox"
                  checked={docTags.includes(tag.slug)}
                  onChange={() => handleToggleTag(tag.slug)}
                />
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: tag.color }}
                />
                <span className={styles.tagName}>{tag.displayName}</span>
                <span className={styles.tagCount}>({tag.documentCount})</span>
              </label>
            ))
          )}
        </div>

        {/* Current tags summary */}
        {docTags.length > 0 && (
          <div className={styles.summary}>
            {docTags.length} tag{docTags.length !== 1 ? 's' : ''} assigned
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.doneBtn} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
