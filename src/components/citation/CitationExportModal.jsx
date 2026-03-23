import { useState, useMemo, useCallback } from 'react'
import { useUIStore } from '../../store/uiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { CitationExporter } from '../../services/citation'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './CitationExportModal.module.css'

export default function CitationExportModal({ onClose }) {
  const [selectedFormat, setSelectedFormat] = useState('bibtex')
  const [isCopying, setIsCopying] = useState(false)

  const exportDocIds = useUIStore((s) => s.exportDocIds)
  const exportSource = useUIStore((s) => s.exportSource)
  const clearExportDocs = useUIStore((s) => s.clearExportDocs)

  const documents = useLibraryStore((s) => s.documents)

  const { showToast } = useToast()

  // Get the actual document objects from IDs
  const exportDocs = useMemo(() => {
    return exportDocIds
      .map(id => documents[id])
      .filter(Boolean)
  }, [exportDocIds, documents])

  // Generate preview content
  const previewContent = useMemo(() => {
    if (exportDocs.length === 0) return ''
    try {
      return CitationExporter.getContent(exportDocs, selectedFormat)
    } catch (error) {
      console.error('Error generating citation:', error)
      return `Error generating citation: ${error.message}`
    }
  }, [exportDocs, selectedFormat])

  const handleClose = useCallback(() => {
    clearExportDocs()
    onClose()
  }, [clearExportDocs, onClose])

  const handleCopy = useCallback(async () => {
    if (!previewContent) return

    setIsCopying(true)
    const result = await CitationExporter.copyToClipboard(previewContent)
    setIsCopying(false)

    if (result.success) {
      showToast({ message: 'Copied to clipboard', type: 'success' })
    } else {
      showToast({ message: 'Failed to copy to clipboard', type: 'error' })
    }
  }, [previewContent, showToast])

  const handleDownload = useCallback(() => {
    if (exportDocs.length === 0) return

    // Generate filename based on source
    let filename = 'citations'
    if (exportDocs.length === 1 && exportDocs[0].metadata?.title) {
      // Single document - use first author and year
      const doc = exportDocs[0]
      const firstAuthor = doc.metadata?.authors?.[0]?.last || 'unknown'
      const year = doc.metadata?.year || 'nd'
      filename = `${firstAuthor.toLowerCase()}-${year}`
    } else if (exportSource === 'folder') {
      filename = 'folder-citations'
    } else if (exportSource === 'tag') {
      filename = 'tag-citations'
    } else if (exportSource === 'collection') {
      filename = 'collection-citations'
    } else if (exportSource === 'bulk') {
      filename = `citations-${exportDocs.length}-documents`
    }

    try {
      CitationExporter.export(exportDocs, selectedFormat, filename)
      showToast({ message: 'Download started', type: 'success' })
    } catch (error) {
      console.error('Error exporting citations:', error)
      showToast({ message: 'Failed to export citations', type: 'error' })
    }
  }, [exportDocs, selectedFormat, exportSource, showToast])

  // Get source label for display
  const sourceLabel = useMemo(() => {
    switch (exportSource) {
      case 'document':
        return 'document'
      case 'bulk':
        return 'selected documents'
      case 'folder':
        return 'folder'
      case 'tag':
        return 'tag'
      case 'collection':
        return 'collection'
      default:
        return 'documents'
    }
  }, [exportSource])

  if (exportDocs.length === 0) {
    return (
      <Modal onClose={handleClose} width={500} title="Export Citations">
        <div className={styles.container}>
          <div className={styles.header}>
            <h2 className={styles.title}>Export Citations</h2>
            <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className={styles.body}>
            <p className={styles.emptyMessage}>No documents selected for export.</p>
          </div>
          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={handleClose}>Close</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={handleClose} width={700} title="Export Citations">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            Export Citations
            <span className={styles.badge}>{exportDocs.length}</span>
          </h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.subtitle}>
            Exporting {exportDocs.length} {exportDocs.length === 1 ? 'document' : 'documents'} from {sourceLabel}
          </p>

          {/* Format selector */}
          <div className={styles.formatSelector}>
            {CitationExporter.formats.map((format) => (
              <button
                key={format.id}
                className={`${styles.formatTab} ${selectedFormat === format.id ? styles.active : ''}`}
                onClick={() => setSelectedFormat(format.id)}
              >
                {format.name}
              </button>
            ))}
          </div>

          {/* Preview area */}
          <div className={styles.previewWrapper}>
            <label className={styles.previewLabel}>Preview</label>
            <textarea
              className={styles.preview}
              value={previewContent}
              readOnly
              spellCheck={false}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={handleCopy}
            disabled={isCopying || !previewContent}
          >
            {isCopying ? 'Copying...' : 'Copy to Clipboard'}
          </button>
          <button
            className={styles.primaryBtn}
            onClick={handleDownload}
            disabled={!previewContent}
          >
            Download {CitationExporter.getExtension(selectedFormat)}
          </button>
        </div>
      </div>
    </Modal>
  )
}
