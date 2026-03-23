import { useState, useRef, useEffect, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useAIStore } from '../../store/aiStore'
import { collectionService } from '../../services/tags/CollectionService'
import styles from './TagScopeSelector.module.css'

/**
 * CollectionScopeSelector - Multi-select collections for AI chat scope
 * Shows dropdown with checkboxes, AND/OR toggle, document count
 */
export default function CollectionScopeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState({})
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  const collectionRegistry = useLibraryStore((s) => s.collectionRegistry)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const documents = useLibraryStore((s) => s.documents)

  const scope = useAIStore((s) => s.scope)
  const toggleScopeCollection = useAIStore((s) => s.toggleScopeCollection)
  const setScopeCollectionMode = useAIStore((s) => s.setScopeCollectionMode)
  const clearScopeCollections = useAIStore((s) => s.clearScopeCollections)

  const scopeCollections = scope.collections || []
  const scopeCollectionMode = scope.collectionMode || 'AND'

  // Get collections with counts
  const collectionsWithCounts = useMemo(() => {
    return collectionService.getAllCollectionsWithCounts(
      collectionRegistry,
      tagRegistry,
      documents
    )
  }, [collectionRegistry, tagRegistry, documents])

  // Filter by search
  const filteredCollections = useMemo(() => {
    if (!search.trim()) return collectionsWithCounts
    const q = search.toLowerCase()
    return collectionsWithCounts.filter(c =>
      c.displayName.toLowerCase().includes(q)
    )
  }, [collectionsWithCounts, search])

  // Calculate matching document count based on selected collections
  const matchingDocCount = useMemo(() => {
    if (scopeCollections.length === 0) return 0

    const selectedCollectionObjects = scopeCollections
      .map(slug => collectionRegistry[slug])
      .filter(Boolean)

    return Object.values(documents).filter(doc => {
      return collectionService.documentMatchesCollections(
        doc,
        selectedCollectionObjects,
        scopeCollectionMode
      )
    }).length
  }, [scopeCollections, scopeCollectionMode, collectionRegistry, documents])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const dropdownWidth = 220

      // Calculate left position, ensure it doesn't overflow right edge
      let left = rect.left
      if (left + dropdownWidth > viewportWidth - 16) {
        left = viewportWidth - dropdownWidth - 16
      }
      if (left < 16) left = 16

      setDropdownStyle({
        top: rect.bottom + 4,
        left: left,
      })
    }
  }, [isOpen])

  // Build display text
  const getDisplayText = () => {
    if (scopeCollections.length === 0) {
      return 'Select collections...'
    }
    const collectionNames = scopeCollections.map(
      slug => collectionRegistry[slug]?.displayName || slug
    )
    if (collectionNames.length === 1) {
      return collectionNames[0]
    }
    return `${collectionNames.length} collections`
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.label}>{getDisplayText()}</span>
        {scopeCollections.length > 0 && (
          <span className={styles.docCount}>({matchingDocCount} docs)</span>
        )}
        <span className={styles.arrow}>{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} style={dropdownStyle}>
          <div className={styles.controls}>
            <input
              type="text"
              className={styles.search}
              placeholder="Search collections..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />

            {scopeCollections.length > 1 && (
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${scopeCollectionMode === 'AND' ? styles.active : ''}`}
                  onClick={() => setScopeCollectionMode('AND')}
                  title="Match documents in ALL selected collections"
                >
                  AND
                </button>
                <button
                  className={`${styles.modeBtn} ${scopeCollectionMode === 'OR' ? styles.active : ''}`}
                  onClick={() => setScopeCollectionMode('OR')}
                  title="Match documents in ANY selected collection"
                >
                  OR
                </button>
              </div>
            )}
          </div>

          <div className={styles.tagList}>
            {filteredCollections.length === 0 ? (
              <div className={styles.empty}>
                {search ? 'No collections match your search' : 'No collections available'}
              </div>
            ) : (
              filteredCollections.map(collection => (
                <label key={collection.slug} className={styles.tagOption}>
                  <input
                    type="checkbox"
                    checked={scopeCollections.includes(collection.slug)}
                    onChange={() => toggleScopeCollection(collection.slug)}
                  />
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: collection.color }}
                  />
                  <span className={styles.tagName}>{collection.displayName}</span>
                  <span className={styles.tagCount}>{collection.documentCount}</span>
                </label>
              ))
            )}
          </div>

          {scopeCollections.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.matchCount}>
                {matchingDocCount} document{matchingDocCount !== 1 ? 's' : ''} match
              </span>
              <button
                className={styles.clearBtn}
                onClick={clearScopeCollections}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
