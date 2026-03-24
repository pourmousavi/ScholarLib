import { memo, useCallback } from 'react'
import styles from './AnnotationLayer.module.css'

/**
 * AnnotationLayer - Renders annotations as an overlay on a PDF page
 *
 * Uses absolute positioning to overlay highlight rectangles
 * on top of the PDF canvas.
 *
 * @param {Array} annotations - Annotations for this page
 * @param {string} selectedAnnotationId - Currently selected annotation ID
 * @param {function} onAnnotationClick - Handler for annotation clicks
 * @param {number} scale - Current zoom scale (100 = 100%)
 */
function AnnotationLayer({
  annotations = [],
  selectedAnnotationId,
  onAnnotationClick,
  scale = 100
}) {
  const handleClick = useCallback((e, annotation) => {
    e.stopPropagation()
    onAnnotationClick?.(annotation)
  }, [onAnnotationClick])

  if (annotations.length === 0) {
    return null
  }

  // Scale factor (PDF.js renders at 1.5x for quality, then CSS scales down)
  const scaleFactor = scale / 100

  return (
    <div className={styles.layer}>
      {annotations.map((annotation) => (
        <AnnotationHighlight
          key={annotation.id}
          annotation={annotation}
          isSelected={annotation.id === selectedAnnotationId}
          onClick={handleClick}
          scaleFactor={scaleFactor}
        />
      ))}
    </div>
  )
}

/**
 * Individual annotation highlight with multiple rects
 */
const AnnotationHighlight = memo(function AnnotationHighlight({
  annotation,
  isSelected,
  onClick,
  scaleFactor
}) {
  const { type, color, position, comment } = annotation
  const { rects = [] } = position || {}

  // Get appropriate opacity based on type
  const getOpacity = () => {
    switch (type) {
      case 'highlight':
        return 0.35
      case 'underline':
        return 0.8
      case 'area':
        return 0.2
      default:
        return 0.35
    }
  }

  // Parse color to RGB for better control
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    }
    return { r: 255, g: 235, b: 59 } // Default yellow
  }

  const rgb = hexToRgb(color)
  const opacity = getOpacity()
  const backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
  const borderColor = isSelected
    ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`
    : 'transparent'

  return (
    <div
      className={`${styles.highlight} ${isSelected ? styles.selected : ''}`}
      onClick={(e) => onClick(e, annotation)}
      role="button"
      tabIndex={0}
      aria-label={`Annotation: ${comment || 'No comment'}`}
      data-annotation
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick(e, annotation)
        }
      }}
    >
      {rects.map((rect, index) => {
        // Add small padding to ensure full text coverage
        // PDF.js text layer positions can be slightly narrower than rendered text
        const rightPadding = type === 'highlight' ? 3 : 0

        const style = {
          position: 'absolute',
          left: `${rect.x1 * scaleFactor}px`,
          top: `${rect.y1 * scaleFactor}px`,
          width: `${(rect.x2 - rect.x1) * scaleFactor + rightPadding}px`,
          height: `${(rect.y2 - rect.y1) * scaleFactor}px`,
          backgroundColor: type === 'underline' ? 'transparent' : backgroundColor,
          borderBottom: type === 'underline' ? `2px solid ${color}` : 'none',
          border: isSelected ? `2px solid ${borderColor}` : 'none',
          borderRadius: type === 'area' ? '2px' : '1px',
          cursor: 'pointer',
          mixBlendMode: type === 'highlight' ? 'multiply' : 'normal',
          pointerEvents: 'auto'
        }

        return <div key={index} style={style} className={styles.rect} />
      })}

      {/* Note indicator for annotations with comments */}
      {comment && type !== 'note' && (
        <NoteIndicator
          rect={rects[0]}
          scaleFactor={scaleFactor}
          color={color}
        />
      )}

      {/* Note icon for standalone notes */}
      {type === 'note' && (
        <NoteIcon
          position={position.boundingRect}
          scaleFactor={scaleFactor}
          color={color}
          isSelected={isSelected}
        />
      )}
    </div>
  )
})

/**
 * Small indicator showing that annotation has a comment
 */
function NoteIndicator({ rect, scaleFactor, color }) {
  if (!rect) return null

  const style = {
    position: 'absolute',
    left: `${(rect.x2) * scaleFactor + 2}px`,
    top: `${rect.y1 * scaleFactor}px`,
    width: '6px',
    height: '6px',
    backgroundColor: color,
    borderRadius: '50%',
    pointerEvents: 'none'
  }

  return <div style={style} className={styles.noteIndicator} />
}

/**
 * Note icon for standalone note annotations
 */
function NoteIcon({ position, scaleFactor, color, isSelected }) {
  if (!position) return null

  const style = {
    position: 'absolute',
    left: `${position.x1 * scaleFactor}px`,
    top: `${position.y1 * scaleFactor}px`,
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color,
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: isSelected ? '0 0 0 2px rgba(0,0,0,0.3)' : 'none'
  }

  return (
    <div style={style} className={styles.noteIcon}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
      </svg>
    </div>
  )
}

export default memo(AnnotationLayer)
