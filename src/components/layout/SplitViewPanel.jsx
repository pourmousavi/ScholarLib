import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import PDFViewer from '../viewer/PDFViewer'
import { NotesPanel } from '../notes'
import { ChatPanel } from '../ai'
import styles from './SplitViewPanel.module.css'

export default function SplitViewPanel({ pdfUrl, docId, onTextExtracted, pdfError }) {
  const splitViewRatio = useUIStore((s) => s.splitViewRatio)
  const setSplitViewRatio = useUIStore((s) => s.setSplitViewRatio)
  const splitViewRightTab = useUIStore((s) => s.splitViewRightTab)
  const setSplitViewRightTab = useUIStore((s) => s.setSplitViewRightTab)

  const containerRef = useRef(null)
  const [isResizing, setIsResizing] = useState(false)
  const [isVertical, setIsVertical] = useState(false)

  // Check if container is narrow and should stack vertically
  useEffect(() => {
    if (!containerRef.current) return

    const checkOrientation = () => {
      const width = containerRef.current?.offsetWidth || 0
      setIsVertical(width < 600)
    }

    // Initial check
    checkOrientation()

    // Use ResizeObserver for responsive behavior
    const resizeObserver = new ResizeObserver(checkOrientation)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  // Handle resize drag
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()

      if (isVertical) {
        // Vertical mode: calculate ratio based on Y position
        const offsetY = e.clientY - rect.top
        const newRatio = offsetY / rect.height
        setSplitViewRatio(newRatio)
      } else {
        // Horizontal mode: calculate ratio based on X position
        const offsetX = e.clientX - rect.left
        const newRatio = offsetX / rect.width
        setSplitViewRatio(newRatio)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, isVertical, setSplitViewRatio])

  const tabs = [
    { id: 'ai', label: 'AI Chat' },
    { id: 'notes', label: 'Notes' }
  ]

  const pdfStyle = isVertical
    ? { height: `${splitViewRatio * 100}%` }
    : { width: `${splitViewRatio * 100}%` }

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isVertical ? styles.vertical : ''} ${isResizing ? styles.resizing : ''}`}
    >
      {/* PDF Section */}
      <div className={styles.pdfSection} style={pdfStyle}>
        <PDFViewer
          url={pdfUrl}
          docId={docId}
          onTextExtracted={onTextExtracted}
          error={pdfError}
        />
      </div>

      {/* Resize Handle */}
      <div
        className={styles.resizeHandle}
        onMouseDown={handleMouseDown}
      >
        <div className={styles.resizeGrip} />
      </div>

      {/* Right Section with Tabs */}
      <div className={styles.rightSection}>
        {/* Tab Bar */}
        <div className={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${splitViewRightTab === tab.id ? styles.active : ''}`}
              onClick={() => setSplitViewRightTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>
          {splitViewRightTab === 'ai' && <ChatPanel />}
          {splitViewRightTab === 'notes' && <NotesPanel />}
        </div>
      </div>
    </div>
  )
}
