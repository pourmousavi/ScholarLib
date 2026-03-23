import { useState, useRef, useEffect, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useAIStore } from '../../store/aiStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagScopeSelector.module.css'

/**
 * TagScopeSelector - Multi-select tags for AI chat scope
 * Shows dropdown with checkboxes, AND/OR toggle, document count
 */
export default function TagScopeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [dropdownStyle, setDropdownStyle] = useState({})
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  const tagRegistry = useLibraryStore((s) => s.tagRegistry)
  const documents = useLibraryStore((s) => s.documents)

  const scope = useAIStore((s) => s.scope)
  const toggleScopeTag = useAIStore((s) => s.toggleScopeTag)
  const setScopeTagMode = useAIStore((s) => s.setScopeTagMode)
  const clearScopeTags = useAIStore((s) => s.clearScopeTags)

  const scopeTags = scope.tags || []
  const scopeTagMode = scope.tagMode || 'AND'

  // Get tags with counts
  const tagsWithCounts = useMemo(() => {
    return tagService.getAllTagsWithCounts(tagRegistry, documents)
  }, [tagRegistry, documents])

  // Filter by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tagsWithCounts
    const q = search.toLowerCase()
    return tagsWithCounts.filter(t =>
      t.displayName.toLowerCase().includes(q)
    )
  }, [tagsWithCounts, search])

  // Calculate matching document count
  const matchingDocCount = useMemo(() => {
    if (scopeTags.length === 0) return 0
    return Object.values(documents).filter(doc => {
      const docTags = doc.user_data?.tags || []
      if (scopeTagMode === 'AND') {
        return scopeTags.every(t => docTags.includes(t))
      } else {
        return scopeTags.some(t => docTags.includes(t))
      }
    }).length
  }, [scopeTags, scopeTagMode, documents])

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
    if (scopeTags.length === 0) {
      return 'Select tags...'
    }
    const tagNames = scopeTags.map(slug => tagRegistry[slug]?.displayName || slug)
    if (tagNames.length === 1) {
      return tagNames[0]
    }
    return `${tagNames.length} tags`
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.label}>{getDisplayText()}</span>
        {scopeTags.length > 0 && (
          <span className={styles.docCount}>({matchingDocCount} docs)</span>
        )}
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown} style={dropdownStyle}>
          <div className={styles.controls}>
            <input
              type="text"
              className={styles.search}
              placeholder="Search tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />

            {scopeTags.length > 1 && (
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${scopeTagMode === 'AND' ? styles.active : ''}`}
                  onClick={() => setScopeTagMode('AND')}
                  title="Match ALL selected tags"
                >
                  AND
                </button>
                <button
                  className={`${styles.modeBtn} ${scopeTagMode === 'OR' ? styles.active : ''}`}
                  onClick={() => setScopeTagMode('OR')}
                  title="Match ANY selected tag"
                >
                  OR
                </button>
              </div>
            )}
          </div>

          <div className={styles.tagList}>
            {filteredTags.length === 0 ? (
              <div className={styles.empty}>
                {search ? 'No tags match your search' : 'No tags available'}
              </div>
            ) : (
              filteredTags.map(tag => (
                <label key={tag.slug} className={styles.tagOption}>
                  <input
                    type="checkbox"
                    checked={scopeTags.includes(tag.slug)}
                    onChange={() => toggleScopeTag(tag.slug)}
                  />
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className={styles.tagName}>{tag.displayName}</span>
                  <span className={styles.tagCount}>{tag.documentCount}</span>
                </label>
              ))
            )}
          </div>

          {scopeTags.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.matchCount}>
                {matchingDocCount} document{matchingDocCount !== 1 ? 's' : ''} match
              </span>
              <button
                className={styles.clearBtn}
                onClick={clearScopeTags}
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
