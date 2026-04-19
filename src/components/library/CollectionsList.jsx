import { useState, useMemo, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useUIStore } from '../../store/uiStore'
import { collectionService } from '../../services/tags/CollectionService'
import { LibraryService } from '../../services/library/LibraryService'
import CollectionEditModal from '../tags/CollectionEditModal'
import CollectionMergeModal from '../tags/CollectionMergeModal'
import CollectionShareModal from '../sharing/CollectionShareModal'
import styles from './CollectionsList.module.css'

/**
 * CollectionsList - Displays all collections in the sidebar with document counts
 * Collections are logical groupings of tags for better organization
 * Supports single-click to filter, multi-select with AND/OR mode
 */
export default function CollectionsList() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCollectionSlug, setEditingCollectionSlug] = useState(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [sharingCollectionSlug, setSharingCollectionSlug] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const collectionRegistry = useLibraryStore((s) => s.collectionRegistry)
  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const documents = useLibraryStore((s) => s.documents)
  const selectedCollections = useLibraryStore((s) => s.selectedCollections)
  const collectionFilterMode = useLibraryStore((s) => s.collectionFilterMode)
  const toggleCollectionSelection = useLibraryStore((s) => s.toggleCollectionSelection)
  const setCollectionFilterMode = useLibraryStore((s) => s.setCollectionFilterMode)
  const clearCollectionFilter = useLibraryStore((s) => s.clearCollectionFilter)
  const selectCollectionFilter = useLibraryStore((s) => s.selectCollectionFilter)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const setShowModal = useUIStore((s) => s.setShowModal)
  const setExportDocs = useUIStore((s) => s.setExportDocs)
  const showDocListMobile = useUIStore((s) => s.showDocListMobile)

  // Helper to save library after collection changes
  const saveLibrary = useCallback(async () => {
    if (isDemoMode || !adapter) return
    try {
      const library = useLibraryStore.getState().getLibrarySnapshot()
      await LibraryService.saveLibrary(adapter, library)
    } catch (e) {
      console.error('Failed to save library:', e)
    }
  }, [adapter, isDemoMode])

  // Get collections with counts
  const collectionsWithCounts = useMemo(() => {
    return collectionService.getAllCollectionsWithCounts(collectionRegistry, tagRegistry, documents)
  }, [collectionRegistry, tagRegistry, documents])

  // Filter by search
  const filteredCollections = useMemo(() => {
    if (!search.trim()) return collectionsWithCounts
    const q = search.toLowerCase()
    return collectionsWithCounts.filter(c =>
      c.displayName.toLowerCase().includes(q) ||
      c.slug.includes(q) ||
      c.description?.toLowerCase().includes(q)
    )
  }, [collectionsWithCounts, search])

  const handleCollectionClick = (slug, e) => {
    // Shift+click for multi-select mode
    if (e.shiftKey || selectedCollections.length > 0) {
      toggleCollectionSelection(slug)
    } else {
      // Single click = filter by this collection only
      selectCollectionFilter(slug)
    }
    // On mobile, auto-navigate to doc list
    if (window.innerWidth < 640) {
      showDocListMobile()
    }
  }

  const handleCollectionRightClick = (slug, e) => {
    e.preventDefault()
    setContextMenu({ slug, x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const hasAnyCollections = Object.keys(collectionRegistry).length > 0

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <button
          className={styles.header}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
          <span className={styles.headerTitle}>Collections</span>
          <span className={styles.headerCount}>{collectionsWithCounts.length}</span>
        </button>
        <div className={styles.headerActions}>
          {hasAnyCollections && (
            <button
              className={styles.actionBtn}
              onClick={() => setShowMergeModal(true)}
              title="Merge collections"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3h3M2 6h3M2 9h3M7 6h3M7 3l2 3-2 3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button
            className={styles.actionBtn}
            onClick={() => setShowCreateModal(true)}
            title="Create new collection"
          >
            +
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {collectionsWithCounts.length > 8 && (
            <div className={styles.searchWrapper}>
              <input
                type="text"
                className={styles.search}
                placeholder="Filter collections..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {selectedCollections.length > 0 && (
            <div className={styles.filterControls}>
              <button
                className={`${styles.modeButton} ${collectionFilterMode === 'AND' ? styles.active : ''}`}
                onClick={() => setCollectionFilterMode('AND')}
                title="Match tags from ALL selected collections"
              >
                AND
              </button>
              <button
                className={`${styles.modeButton} ${collectionFilterMode === 'OR' ? styles.active : ''}`}
                onClick={() => setCollectionFilterMode('OR')}
                title="Match tags from ANY selected collection"
              >
                OR
              </button>
              <button
                className={styles.clearButton}
                onClick={clearCollectionFilter}
                title="Clear collection filter"
              >
                Clear
              </button>
            </div>
          )}

          <div className={styles.collectionsList}>
            {filteredCollections.map(collection => (
              <button
                key={collection.slug}
                className={`${styles.collectionItem} ${selectedCollections.includes(collection.slug) ? styles.selected : ''}`}
                onClick={(e) => handleCollectionClick(collection.slug, e)}
                onContextMenu={(e) => handleCollectionRightClick(collection.slug, e)}
                title={`${collection.displayName}${collection.description ? `: ${collection.description}` : ''}\n${collection.tagCount} tags, ${collection.documentCount} docs (right-click to edit)`}
              >
                <span
                  className={styles.colorBar}
                  style={{ backgroundColor: collection.color }}
                />
                <svg className={styles.folderIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V9C21 7.89543 20.1046 7 19 7H12L10 5H5C3.89543 5 3 5.89543 3 7Z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={styles.collectionName}>{collection.displayName}</span>
                <span className={styles.tagCount}>{collection.tagCount}</span>
                <span className={styles.docCount}>{collection.documentCount}</span>
              </button>
            ))}

            {filteredCollections.length === 0 && search && (
              <div className={styles.noResults}>No collections match "{search}"</div>
            )}

            {!hasAnyCollections && (
              <div className={styles.emptyState}>
                <p>No collections yet</p>
                <button
                  className={styles.createFirstBtn}
                  onClick={() => setShowCreateModal(true)}
                >
                  + Create your first collection
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Context menu for collection actions */}
      {contextMenu && (
        <>
          <div className={styles.contextOverlay} onClick={closeContextMenu} />
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className={styles.contextItem}
              onClick={() => {
                setEditingCollectionSlug(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Edit collection...
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                selectCollectionFilter(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Filter by this collection
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                setSharingCollectionSlug(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Share collection...
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                // Get all document IDs in this collection
                const collection = collectionRegistry[contextMenu.slug]
                if (!collection) {
                  closeContextMenu()
                  return
                }

                // Find all documents that match this collection
                const collectionDocIds = Object.values(documents)
                  .filter(doc => collectionService.documentMatchesCollection(doc, collection))
                  .map(d => d.id)

                if (collectionDocIds.length === 0) {
                  closeContextMenu()
                  return
                }

                setExportDocs(collectionDocIds, 'collection')
                setShowModal('export-citations')
                closeContextMenu()
              }}
            >
              Export citations...
            </button>
          </div>
        </>
      )}

      {/* Create/Edit collection modal */}
      {(showCreateModal || editingCollectionSlug) && (
        <CollectionEditModal
          slug={editingCollectionSlug}
          onClose={() => {
            setShowCreateModal(false)
            setEditingCollectionSlug(null)
          }}
          onSave={saveLibrary}
        />
      )}

      {/* Merge collections modal */}
      {showMergeModal && (
        <CollectionMergeModal
          onClose={() => setShowMergeModal(false)}
          onSave={saveLibrary}
        />
      )}

      {/* Share collection modal */}
      {sharingCollectionSlug && (
        <CollectionShareModal
          collectionSlug={sharingCollectionSlug}
          onClose={() => setSharingCollectionSlug(null)}
        />
      )}
    </div>
  )
}
