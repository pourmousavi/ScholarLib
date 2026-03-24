import { useState, useMemo, useCallback } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useStorageStore } from '../../store/storageStore'
import { useUIStore } from '../../store/uiStore'
import { tagService } from '../../services/tags/TagService'
import { LibraryService } from '../../services/library/LibraryService'
import TagEditModal from '../tags/TagEditModal'
import TagMergeModal from '../tags/TagMergeModal'
import TagShareModal from '../sharing/TagShareModal'
import styles from './TagsList.module.css'

/**
 * TagsList - Displays all tags in the sidebar with document counts
 * Supports single-click to filter, multi-select with AND/OR mode
 */
export default function TagsList() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [editingTagSlug, setEditingTagSlug] = useState(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [sharingTagSlug, setSharingTagSlug] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const createTag = useLibraryStore((s) => s.createTag)
  const documents = useLibraryStore((s) => s.documents)
  const selectedTags = useLibraryStore((s) => s.selectedTags)
  const tagFilterMode = useLibraryStore((s) => s.tagFilterMode)
  const toggleTagSelection = useLibraryStore((s) => s.toggleTagSelection)
  const setTagFilterMode = useLibraryStore((s) => s.setTagFilterMode)
  const clearTagFilter = useLibraryStore((s) => s.clearTagFilter)
  const selectTagFilter = useLibraryStore((s) => s.selectTagFilter)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const setShowModal = useUIStore((s) => s.setShowModal)
  const setExportDocs = useUIStore((s) => s.setExportDocs)
  const showDocListMobile = useUIStore((s) => s.showDocListMobile)

  // Helper to save library after tag changes
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

  // Get tags with counts
  const tagsWithCounts = useMemo(() => {
    return tagService.getAllTagsWithCounts(tagRegistry, documents)
  }, [tagRegistry, documents])

  // Filter by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tagsWithCounts
    const q = search.toLowerCase()
    return tagsWithCounts.filter(t =>
      t.displayName.toLowerCase().includes(q) ||
      t.slug.includes(q)
    )
  }, [tagsWithCounts, search])

  // Group by category
  const groupedTags = useMemo(() => {
    const groups = {}
    for (const tag of filteredTags) {
      const cat = tag.category || 'uncategorized'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(tag)
    }
    // Sort categories, putting 'uncategorized' last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'uncategorized') return 1
      if (b === 'uncategorized') return -1
      return a.localeCompare(b)
    })
    return sortedKeys.map(key => ({ category: key, tags: groups[key] }))
  }, [filteredTags])

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    const result = await createTag(newTagName.trim())
    if (!result.error) {
      setNewTagName('')
      setShowCreateInput(false)
      // Save to storage
      await saveLibrary()
    }
  }

  const handleTagClick = (slug, e) => {
    // Shift+click for multi-select mode
    if (e.shiftKey || selectedTags.length > 0) {
      toggleTagSelection(slug)
    } else {
      // Single click = filter by this tag only
      selectTagFilter(slug)
    }
    // On mobile, auto-navigate to doc list
    if (window.innerWidth < 640) {
      showDocListMobile()
    }
  }

  const handleTagRightClick = (slug, e) => {
    e.preventDefault()
    setContextMenu({ slug, x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const hasAnyTags = Object.keys(tagRegistry).length > 0

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <button
          className={styles.header}
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
          <span className={styles.headerTitle}>Tags</span>
          <span className={styles.headerCount}>{tagsWithCounts.length}</span>
        </button>
        <div className={styles.headerActions}>
          {hasAnyTags && (
            <button
              className={styles.actionBtn}
              onClick={() => setShowMergeModal(true)}
              title="Merge tags"
            >
              ⎌
            </button>
          )}
          <button
            className={styles.actionBtn}
            onClick={() => setShowCreateInput(true)}
            title="Create new tag"
          >
            +
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {showCreateInput && (
            <div className={styles.createWrapper}>
              <input
                type="text"
                className={styles.createInput}
                placeholder="New tag name..."
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTag()
                  if (e.key === 'Escape') {
                    setShowCreateInput(false)
                    setNewTagName('')
                  }
                }}
                autoFocus
              />
              <button
                className={styles.createBtn}
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
              >
                Add
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => {
                  setShowCreateInput(false)
                  setNewTagName('')
                }}
              >
                ✕
              </button>
            </div>
          )}

          {tagsWithCounts.length > 8 && (
            <div className={styles.searchWrapper}>
              <input
                type="text"
                className={styles.search}
                placeholder="Filter tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {selectedTags.length > 0 && (
            <div className={styles.filterControls}>
              <button
                className={`${styles.modeButton} ${tagFilterMode === 'AND' ? styles.active : ''}`}
                onClick={() => setTagFilterMode('AND')}
                title="Match ALL selected tags"
              >
                AND
              </button>
              <button
                className={`${styles.modeButton} ${tagFilterMode === 'OR' ? styles.active : ''}`}
                onClick={() => setTagFilterMode('OR')}
                title="Match ANY selected tag"
              >
                OR
              </button>
              <button
                className={styles.clearButton}
                onClick={clearTagFilter}
                title="Clear tag filter"
              >
                Clear
              </button>
            </div>
          )}

          <div className={styles.tagsList}>
            {groupedTags.map(({ category, tags }) => (
              <div key={category} className={styles.group}>
                {category !== 'uncategorized' && (
                  <div className={styles.categoryLabel}>{category}</div>
                )}
                {tags.map(tag => (
                  <button
                    key={tag.slug}
                    className={`${styles.tagItem} ${selectedTags.includes(tag.slug) ? styles.selected : ''}`}
                    onClick={(e) => handleTagClick(tag.slug, e)}
                    onContextMenu={(e) => handleTagRightClick(tag.slug, e)}
                    title={`${tag.displayName}${tag.description ? `: ${tag.description}` : ''} (right-click to edit)`}
                  >
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className={styles.tagName}>{tag.displayName}</span>
                    <span className={styles.tagCount}>{tag.documentCount}</span>
                  </button>
                ))}
              </div>
            ))}

            {filteredTags.length === 0 && search && (
              <div className={styles.noResults}>No tags match "{search}"</div>
            )}

            {!hasAnyTags && !showCreateInput && (
              <div className={styles.emptyState}>
                <p>No tags yet</p>
                <button
                  className={styles.createFirstBtn}
                  onClick={() => setShowCreateInput(true)}
                >
                  + Create your first tag
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Context menu for tag actions */}
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
                setEditingTagSlug(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Edit tag...
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                selectTagFilter(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Filter by this tag
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                setSharingTagSlug(contextMenu.slug)
                closeContextMenu()
              }}
            >
              Share tag...
            </button>
            <button
              className={styles.contextItem}
              onClick={() => {
                // Get all document IDs with this tag
                const tagDocIds = Object.values(documents)
                  .filter(d => d.user_data?.tags?.includes(contextMenu.slug))
                  .map(d => d.id)

                if (tagDocIds.length === 0) {
                  closeContextMenu()
                  return
                }

                setExportDocs(tagDocIds, 'tag')
                setShowModal('export-citations')
                closeContextMenu()
              }}
            >
              Export citations...
            </button>
          </div>
        </>
      )}

      {/* Edit tag modal */}
      {editingTagSlug && (
        <TagEditModal
          slug={editingTagSlug}
          onClose={() => setEditingTagSlug(null)}
        />
      )}

      {/* Merge tags modal */}
      {showMergeModal && (
        <TagMergeModal onClose={() => setShowMergeModal(false)} />
      )}

      {/* Share tag modal */}
      {sharingTagSlug && (
        <TagShareModal
          tagSlug={sharingTagSlug}
          onClose={() => setSharingTagSlug(null)}
        />
      )}
    </div>
  )
}
