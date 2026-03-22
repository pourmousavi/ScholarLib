import { useState, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagsList.module.css'

/**
 * TagsList - Displays all tags in the sidebar with document counts
 * Supports single-click to filter, multi-select with AND/OR mode
 */
export default function TagsList() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const documents = useLibraryStore((s) => s.documents)
  const selectedTags = useLibraryStore((s) => s.selectedTags)
  const tagFilterMode = useLibraryStore((s) => s.tagFilterMode)
  const toggleTagSelection = useLibraryStore((s) => s.toggleTagSelection)
  const setTagFilterMode = useLibraryStore((s) => s.setTagFilterMode)
  const clearTagFilter = useLibraryStore((s) => s.clearTagFilter)
  const selectTagFilter = useLibraryStore((s) => s.selectTagFilter)

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

  // Don't show section if no tags exist
  if (Object.keys(tagRegistry).length === 0) {
    return null
  }

  const handleTagClick = (slug, e) => {
    // Shift+click for multi-select mode
    if (e.shiftKey || selectedTags.length > 0) {
      toggleTagSelection(slug)
    } else {
      // Single click = filter by this tag only
      selectTagFilter(slug)
    }
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.header}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
        <span className={styles.headerTitle}>Tags</span>
        <span className={styles.headerCount}>{tagsWithCounts.length}</span>
      </button>

      {!collapsed && (
        <>
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
                    title={`${tag.displayName}${tag.description ? `: ${tag.description}` : ''}`}
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
          </div>
        </>
      )}
    </div>
  )
}
