import { useState, useMemo, useCallback } from 'react'
import Modal from '../ui/Modal'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { tagService } from '../../services/tags/TagService'
import { LibraryService } from '../../services/library/LibraryService'
import styles from './QuickTagModal.module.css'

/**
 * QuickTagModal - Quick tag assignment for a single document
 * Shows checkboxes for existing tags to assign/remove from document
 * Note: Tag creation is done centrally in Tags section of sidebar
 */
export default function QuickTagModal({ docId, onClose }) {
  const [search, setSearch] = useState('')

  const documents = useLibraryStore((s) => s.documents)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const addTagToDocument = useLibraryStore((s) => s.addTagToDocument)
  const removeTagFromDocument = useLibraryStore((s) => s.removeTagFromDocument)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const doc = documents[docId]
  const docTags = doc?.user_data?.tags || []

  // Helper to save library after tag changes
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const { folders, documents, tagRegistry, smartCollections } = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, {
        version: '1.0',
        folders,
        documents,
        tag_registry: tagRegistry,
        smart_collections: smartCollections
      })
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

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

  const handleToggleTag = async (slug) => {
    if (docTags.includes(slug)) {
      removeTagFromDocument(docId, slug)
    } else {
      addTagToDocument(docId, slug)
    }
    // Save changes to storage after state update settles
    // Use setTimeout to ensure Zustand state is fully updated before reading
    setTimeout(async () => {
      await saveLibrary()
    }, 0)
  }

  if (!doc) return null

  const title = doc.metadata?.title || doc.filename
  const hasAnyTags = Object.keys(tagRegistry).length > 0

  return (
    <Modal title="Assign Tags" onClose={onClose} width={400}>
      <div className={styles.container}>
        <h2 className={styles.title}>Assign Tags</h2>
        <p className={styles.docTitle} title={title}>
          {title.length > 60 ? title.slice(0, 60) + '...' : title}
        </p>

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
          {!hasAnyTags ? (
            <div className={styles.empty}>
              No tags exist yet. Create tags in the Tags section of the sidebar.
            </div>
          ) : filteredTags.length === 0 ? (
            <div className={styles.empty}>
              No tags match "{search}"
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
