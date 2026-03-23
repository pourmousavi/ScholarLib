import { useState, useMemo, useCallback } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { LibraryService } from '../../services/library/LibraryService'
import { collectionService } from '../../services/tags/CollectionService'
import styles from './AddToCollectionModal.module.css'

/**
 * AddToCollectionModal - Add document to a collection by adding tags from that collection
 * Two-step flow:
 * 1. Select a collection
 * 2. Select which tags from that collection to add to the document
 */
export default function AddToCollectionModal({ docId, onClose }) {
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [selectedTags, setSelectedTags] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  const documents = useLibraryStore(s => s.documents)
  const collectionRegistry = useLibraryStore(s => s.collectionRegistry)
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const addTagToDocument = useLibraryStore(s => s.addTagToDocument)

  const adapter = useStorageStore(s => s.adapter)
  const isDemoMode = useStorageStore(s => s.isDemoMode)

  const doc = documents[docId]
  const docTags = doc?.user_data?.tags || []

  // Helper to save library after updates
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const { folders, documents, tagRegistry, collectionRegistry, smartCollections } = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, {
        version: '1.1',
        folders,
        documents,
        tag_registry: tagRegistry,
        collection_registry: collectionRegistry,
        smart_collections: smartCollections
      })
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  // Get collections with counts
  const collectionsWithCounts = useMemo(() => {
    return collectionService.getAllCollectionsWithCounts(collectionRegistry, tagRegistry, documents)
  }, [collectionRegistry, tagRegistry, documents])

  // Get tags from selected collection that are not already on the document
  const availableTags = useMemo(() => {
    if (!selectedCollection) return []
    const collection = collectionRegistry[selectedCollection]
    if (!collection) return []

    return collection.tags
      .filter(slug => !docTags.includes(slug))
      .map(slug => ({
        slug,
        ...tagRegistry[slug]
      }))
      .filter(tag => tag.displayName) // Only include tags that exist in registry
  }, [selectedCollection, collectionRegistry, tagRegistry, docTags])

  // Tags from collection already on document
  const existingTags = useMemo(() => {
    if (!selectedCollection) return []
    const collection = collectionRegistry[selectedCollection]
    if (!collection) return []

    return collection.tags
      .filter(slug => docTags.includes(slug))
      .map(slug => ({
        slug,
        ...tagRegistry[slug]
      }))
      .filter(tag => tag.displayName)
  }, [selectedCollection, collectionRegistry, tagRegistry, docTags])

  const toggleTag = (slug) => {
    setSelectedTags(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    )
  }

  const handleAddTags = async () => {
    if (selectedTags.length === 0) return

    setIsSaving(true)
    try {
      for (const slug of selectedTags) {
        addTagToDocument(docId, slug)
      }
      await saveLibrary()
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleBack = () => {
    setSelectedCollection(null)
    setSelectedTags([])
  }

  if (!doc) return null

  return (
    <Modal
      title="Add to Collection"
      onClose={onClose}
      width={400}
    >
      <div className={styles.container}>
        {!selectedCollection ? (
          // Step 1: Select collection
          <>
            <h3 className={styles.stepTitle}>Select a collection</h3>
            <p className={styles.description}>
              Choose a collection to add tags from
            </p>

            <div className={styles.collectionList}>
              {collectionsWithCounts.length === 0 ? (
                <div className={styles.empty}>
                  No collections available. Create one first.
                </div>
              ) : (
                collectionsWithCounts.map(collection => (
                  <button
                    key={collection.slug}
                    className={styles.collectionItem}
                    onClick={() => setSelectedCollection(collection.slug)}
                  >
                    <span
                      className={styles.colorBar}
                      style={{ backgroundColor: collection.color }}
                    />
                    <span className={styles.collectionName}>
                      {collection.displayName}
                    </span>
                    <span className={styles.tagCount}>
                      {collection.tagCount} tags
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className={styles.actions}>
              <Btn onClick={onClose}>Cancel</Btn>
            </div>
          </>
        ) : (
          // Step 2: Select tags from collection
          <>
            <h3 className={styles.stepTitle}>
              Add tags from "{collectionRegistry[selectedCollection]?.displayName}"
            </h3>

            {existingTags.length > 0 && (
              <div className={styles.existingSection}>
                <span className={styles.existingLabel}>Already on document:</span>
                <div className={styles.existingTags}>
                  {existingTags.map(tag => (
                    <span
                      key={tag.slug}
                      className={styles.existingTag}
                      style={{ borderColor: tag.color, color: tag.color }}
                    >
                      {tag.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {availableTags.length === 0 ? (
              <div className={styles.empty}>
                {existingTags.length > 0
                  ? 'All tags from this collection are already on this document.'
                  : 'This collection has no tags.'}
              </div>
            ) : (
              <>
                <p className={styles.description}>
                  Select tags to add to this document
                </p>

                <div className={styles.tagList}>
                  {availableTags.map(tag => (
                    <label key={tag.slug} className={styles.tagItem}>
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag.slug)}
                        onChange={() => toggleTag(tag.slug)}
                      />
                      <span
                        className={styles.tagColor}
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className={styles.tagName}>{tag.displayName}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className={styles.actions}>
              <Btn onClick={handleBack}>Back</Btn>
              <Btn
                gold
                onClick={handleAddTags}
                disabled={selectedTags.length === 0 || isSaving}
              >
                {isSaving ? 'Adding...' : `Add ${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}`}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
