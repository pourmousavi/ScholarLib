import { memo, useCallback, useRef, useEffect, useState } from 'react'
import { ANNOTATION_COLORS } from '../../services/annotations'
import styles from './HighlightToolbar.module.css'

/**
 * HighlightToolbar - Floating toolbar that appears on text selection
 *
 * Shows color options and a highlight button when text is selected
 * in the PDF viewer.
 *
 * @param {Object} selection - Selection data { text, page, rects, boundingRect }
 * @param {function} onHighlight - Called when highlight button clicked
 * @param {function} onColorChange - Called when color is changed
 * @param {string} currentColor - Currently selected color
 * @param {function} onClose - Called to dismiss toolbar
 * @param {HTMLElement} containerRef - Reference to position relative to
 */
function HighlightToolbar({
  selection,
  onHighlight,
  onColorChange,
  currentColor,
  onClose,
  containerRef
}) {
  const toolbarRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Calculate toolbar position based on selection
  useEffect(() => {
    if (!selection?.boundingRect || !containerRef?.current || !toolbarRef.current) {
      return
    }

    const containerRect = containerRef.current.getBoundingClientRect()
    const toolbarRect = toolbarRef.current.getBoundingClientRect()
    const selectionRect = selection.boundingRect

    // Find the page element to get correct offset
    const pageElement = containerRef.current.querySelector(`[data-page-number="${selection.page}"]`)
    if (!pageElement) return

    const pageRect = pageElement.getBoundingClientRect()

    // Position above the selection, centered
    const selectionCenterX = pageRect.left + selectionRect.x1 + (selectionRect.x2 - selectionRect.x1) / 2
    let left = selectionCenterX - containerRect.left - toolbarRect.width / 2
    let top = pageRect.top + selectionRect.y1 - containerRect.top - toolbarRect.height - 8

    // Keep within container bounds
    const padding = 8
    if (left < padding) left = padding
    if (left + toolbarRect.width > containerRect.width - padding) {
      left = containerRect.width - toolbarRect.width - padding
    }

    // If not enough space above, show below
    if (top < padding) {
      top = pageRect.top + selectionRect.y2 - containerRect.top + 8
    }

    setPosition({ top, left })
  }, [selection, containerRef])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        // Small delay to allow highlight action to complete
        setTimeout(() => {
          const windowSelection = window.getSelection()
          if (!windowSelection || windowSelection.isCollapsed) {
            onClose?.()
          }
        }, 100)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleHighlight = useCallback(() => {
    onHighlight?.()
  }, [onHighlight])

  const handleColorSelect = useCallback((color) => {
    onColorChange?.(color)
    setShowColorPicker(false)
  }, [onColorChange])

  if (!selection) {
    return null
  }

  return (
    <div
      ref={toolbarRef}
      className={styles.toolbar}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
      role="toolbar"
      aria-label="Highlight toolbar"
    >
      {/* Color button with picker */}
      <div className={styles.colorSection}>
        <button
          className={styles.colorButton}
          onClick={() => setShowColorPicker(!showColorPicker)}
          style={{ backgroundColor: currentColor }}
          aria-label="Select highlight color"
          aria-expanded={showColorPicker}
        />

        {showColorPicker && (
          <div className={styles.colorPicker} role="listbox" aria-label="Color options">
            {Object.entries(ANNOTATION_COLORS).map(([name, color]) => (
              <button
                key={name}
                className={`${styles.colorOption} ${color === currentColor ? styles.selected : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleColorSelect(color)}
                aria-label={`${name} color`}
                aria-selected={color === currentColor}
                role="option"
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight button */}
      <button
        className={styles.highlightButton}
        onClick={handleHighlight}
        aria-label="Create highlight"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.54 3.5l4.95 4.95-9.9 9.9H5.64v-4.95l9.9-9.9zm1.41-1.41l-1.41 1.41-4.95-4.95 1.41-1.41 4.95 4.95zm-12.03 17.41h12v2h-12v-2z"/>
        </svg>
        <span>Highlight</span>
      </button>

      {/* Note button */}
      <button
        className={styles.noteButton}
        onClick={() => onHighlight?.({ withComment: true })}
        aria-label="Highlight with note"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </button>
    </div>
  )
}

export default memo(HighlightToolbar)
