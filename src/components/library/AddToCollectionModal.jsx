import { useState, useMemo, useCallback } from 'react'
import Modal from '../ui/Modal'
import Btn from '../ui/Btn'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { collectionService } from '../../services/tags/CollectionService'
import styles from './AddToCollectionModal.module.css'

/**
 * AddToCollectionModal - Add document to a collection
 *
 * Supports hybrid collection membership:
 * - Add document directly to collection (explicit include, regardless of tags)
 * - Optionally also add tags from the collection to the document
 */
export default function AddToCollectionModal({ docId, onClose }) {
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [selectedTags, setSelectedTags] = useState([])
  const [addDirectly, setAddDirectly] = useState(true) // Default to direct add
  const [isSaving, setIsSaving] = useState(false)

  const documents = useLibraryStore(s => s.documents)
  const collectionRegistry = useLibraryStore(s => s.collectionRegistry)
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const addTagToDocument = useLibraryStore(s => s.addTagToDocument)
  const addDocToCollection = useLibraryStore(s => s.addDocToCollection)

  const adapter = useStorageStore(s => s.adapter)
  const isDemoMode = useStorageStore(s => s.isDemoMode)

  const doc = documents[docId]
  const docTags = doc?.user_data?.tags || []

  // Helper to save library after updates
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      await useLibraryStore.getState().saveLibrary(adapter)
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  // Get collections the document is already in
  const docCollections = useMemo(() => {
    return collectionService.getCollectionsForDocument(collectionRegistry, doc)
  }, [collectionRegistry, doc])

  const docCollectionSlugs = useMemo(() => {
    return docCollections.map(c => c.slug)
  }, [docCollections])

  // Get collections with counts, excluding ones doc is already in
  const collectionsWithCounts = useMemo(() => {
    const all = collectionService.getAllCollectionsWithCounts(collectionRegistry, tagRegistry, documents)
    return all.filter(c => !docCollectionSlugs.includes(c.slug))
  }, [collectionRegistry, tagRegistry, documents, docCollectionSlugs])

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

  const handleAdd = async () => {
    if (!selectedCollection) return
    if (!addDirectly && selectedTags.length === 0) return

    setIsSaving(true)
    try {
      // Add document directly to collection if selected
      if (addDirectly) {
        const result = addDocToCollection(selectedCollection, docId)
        if (result.error) {
          console.error('Failed to add to collection:', result.error)
        }
      }

      // Also add any selected tags
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
          // Step 2: Configure how to add to collection
          <>
            <h3 className={styles.stepTitle}>
              Add to "{collectionRegistry[selectedCollection]?.displayName}"
            </h3>

            {/* Direct add option */}
            <label className={styles.directAddOption}>
              <input
                type="checkbox"
                checked={addDirectly}
                onChange={(e) => setAddDirectly(e.target.checked)}
              />
              <span className={styles.directAddLabel}>
                Add document directly to collection
              </span>
              <span className={styles.directAddHint}>
                Document will appear in this collection regardless of its tags
              </span>
            </label>

            {/* Optional: Also add tags */}
            {availableTags.length > 0 && (
              <div className={styles.tagSection}>
                <p className={styles.tagSectionTitle}>
                  Optionally, also add tags from this collection:
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
              </div>
            )}

            {existingTags.length > 0 && (
              <div className={styles.existingSection}>
                <span className={styles.existingLabel}>Tags already on document:</span>
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

            <div className={styles.actions}>
              <Btn onClick={handleBack}>Back</Btn>
              <Btn
                gold
                onClick={handleAdd}
                disabled={(!addDirectly && selectedTags.length === 0) || isSaving}
              >
                {isSaving ? 'Adding...' : (
                  addDirectly
                    ? (selectedTags.length > 0 ? `Add to collection + ${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}` : 'Add to collection')
                    : `Add ${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''}`
                )}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
