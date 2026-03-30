import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { ANNOTATION_COLORS } from '../../services/annotations'
import AnnotationCard from './AnnotationCard'
import styles from './AnnotationSidebar.module.css'

/**
 * AnnotationSidebar - Sidebar panel listing all annotations
 *
 * Shows all annotations for the current document with filtering,
 * sorting, and navigation capabilities.
 *
 * @param {Array} annotations - All annotations for current document
 * @param {string} selectedAnnotationId - Currently selected annotation
 * @param {function} onSelectAnnotation - Called when annotation is clicked
 * @param {function} onUpdateComment - Called when comment is updated
 * @param {function} onUpdateColor - Called when color is changed
 * @param {function} onDelete - Called when annotation is deleted
 * @param {function} onNavigateToAnnotation - Called to scroll to annotation
 * @param {function} onClose - Called to close sidebar
 */
function AnnotationSidebar({
  annotations = [],
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateComment,
  onUpdateColor,
  onDelete,
  onNavigateToAnnotation,
  onClose,
  embedded = false // When true, hide close button and adjust styling for fullscreen overlay
}) {
  const [filterType, setFilterType] = useState('all')
  const [filterColor, setFilterColor] = useState(null)
  const [sortBy, setSortBy] = useState('page') // 'page' | 'date' | 'color'
  const [searchQuery, setSearchQuery] = useState('')

  // Refs for scrolling to selected annotation
  const listRef = useRef(null)
  const cardRefsMap = useRef(new Map())

  // Filter and sort annotations
  const filteredAnnotations = useMemo(() => {
    let result = [...annotations]

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(a => a.type === filterType)
    }

    // Filter by color
    if (filterColor) {
      result = result.filter(a => a.color === filterColor)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(a =>
        a.content?.text?.toLowerCase().includes(query) ||
        a.comment?.toLowerCase().includes(query)
      )
    }

    // Sort
    switch (sortBy) {
      case 'page':
        result.sort((a, b) => {
          const pageDiff = (a.position?.page || 0) - (b.position?.page || 0)
          if (pageDiff !== 0) return pageDiff
          return (a.position?.boundingRect?.y1 || 0) - (b.position?.boundingRect?.y1 || 0)
        })
        break
      case 'date':
        result.sort((a, b) =>
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
        )
        break
      case 'color':
        result.sort((a, b) => (a.color || '').localeCompare(b.color || ''))
        break
      default:
        break
    }

    return result
  }, [annotations, filterType, filterColor, sortBy, searchQuery])

  // Count by type
  const typeCounts = useMemo(() => {
    const counts = { highlight: 0, underline: 0, area: 0, note: 0, ink: 0 }
    annotations.forEach(a => {
      if (counts[a.type] !== undefined) {
        counts[a.type]++
      }
    })
    return counts
  }, [annotations])

  // Count by color
  const colorCounts = useMemo(() => {
    const counts = {}
    annotations.forEach(a => {
      counts[a.color] = (counts[a.color] || 0) + 1
    })
    return counts
  }, [annotations])

  const handleAnnotationClick = useCallback((annotation) => {
    onSelectAnnotation?.(annotation.id)
    onNavigateToAnnotation?.(annotation)
  }, [onSelectAnnotation, onNavigateToAnnotation])

  // Scroll to selected annotation when selection changes from outside (e.g., clicking in PDF)
  useEffect(() => {
    if (selectedAnnotationId && listRef.current) {
      const cardElement = cardRefsMap.current.get(selectedAnnotationId)
      if (cardElement) {
        cardElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [selectedAnnotationId])

  return (
    <div className={`${styles.sidebar} ${embedded ? styles.embedded : ''}`}>
      {/* Header - only show in standalone mode */}
      {!embedded && (
        <div className={styles.header}>
          <h3 className={styles.title}>
            Annotations
            <span className={styles.count}>{annotations.length}</span>
          </h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Search */}
      <div className={styles.search}>
        <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search annotations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className={styles.clearSearch}
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {/* Type filter */}
        <div className={styles.filterGroup}>
          <select
            className={styles.select}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="highlight">Highlights ({typeCounts.highlight})</option>
            <option value="underline">Underlines ({typeCounts.underline})</option>
            <option value="area">Areas ({typeCounts.area})</option>
            <option value="note">Notes ({typeCounts.note})</option>
            <option value="ink">Ink ({typeCounts.ink})</option>
          </select>
        </div>

        {/* Color filter */}
        <div className={styles.colorFilter}>
          <button
            className={`${styles.colorChip} ${!filterColor ? styles.active : ''}`}
            onClick={() => setFilterColor(null)}
            aria-label="Show all colors"
          >
            All
          </button>
          {Object.entries(ANNOTATION_COLORS).map(([name, color]) => {
            const count = colorCounts[color] || 0
            if (count === 0) return null
            return (
              <button
                key={name}
                className={`${styles.colorChip} ${filterColor === color ? styles.active : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setFilterColor(filterColor === color ? null : color)}
                aria-label={`Filter by ${name}`}
                title={`${name} (${count})`}
              />
            )
          })}
        </div>

        {/* Sort */}
        <div className={styles.filterGroup}>
          <select
            className={styles.select}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort by"
          >
            <option value="page">Sort by page</option>
            <option value="date">Sort by date</option>
            <option value="color">Sort by color</option>
          </select>
        </div>
      </div>

      {/* Annotations list */}
      <div className={styles.list} ref={listRef}>
        {filteredAnnotations.length === 0 ? (
          <div className={styles.empty}>
            {annotations.length === 0 ? (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className={styles.emptyIcon}>
                  <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9zm1.41-1.41l-1.41 1.41-4.95-4.95 1.41-1.41 4.95 4.95zm-12.03 17.41h12v2h-12v-2z"/>
                </svg>
                <p>No annotations yet</p>
                <span className={styles.emptyHint}>
                  Select text in the PDF to create highlights
                </span>
              </>
            ) : (
              <>
                <p>No matching annotations</p>
                <span className={styles.emptyHint}>
                  Try adjusting your filters
                </span>
              </>
            )}
          </div>
        ) : (
          filteredAnnotations.map((annotation) => (
            <div
              key={annotation.id}
              ref={(el) => {
                if (el) {
                  cardRefsMap.current.set(annotation.id, el)
                } else {
                  cardRefsMap.current.delete(annotation.id)
                }
              }}
            >
              <AnnotationCard
                annotation={annotation}
                isSelected={annotation.id === selectedAnnotationId}
                onClick={() => handleAnnotationClick(annotation)}
                onUpdateComment={onUpdateComment}
                onUpdateColor={onUpdateColor}
                onDelete={onDelete}
              />
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      {annotations.length > 0 && (
        <div className={styles.footer}>
          <span className={styles.stats}>
            {filteredAnnotations.length} of {annotations.length} shown
          </span>
        </div>
      )}
    </div>
  )
}

export default memo(AnnotationSidebar)
