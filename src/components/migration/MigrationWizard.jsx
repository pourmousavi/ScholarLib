import { useState, useCallback } from 'react'
import Modal from '../ui/Modal'
import ExportStep from './ExportStep'
import ImportUploadStep from './ImportUploadStep'
import ImportScanStep from './ImportScanStep'
import ImportReviewStep from './ImportReviewStep'
import ImportCompleteStep from './ImportCompleteStep'
import styles from './MigrationWizard.module.css'

/**
 * MigrationWizard - Multi-step modal for exporting/importing library bundles
 *
 * Modes:
 * - export: Show export summary and download
 * - import: Upload → Scan → Review → Complete
 */
export default function MigrationWizard({ mode, adapter, provider, onClose, onComplete }) {
  const [step, setStep] = useState(mode === 'export' ? 'export' : 'upload')
  const [bundle, setBundle] = useState(null)
  const [matchResults, setMatchResults] = useState(null)
  const [importStats, setImportStats] = useState(null)

  const handleExportComplete = useCallback(() => {
    onClose()
  }, [onClose])

  const handleBundleUploaded = useCallback((parsedBundle) => {
    setBundle(parsedBundle)
    setStep('scan')
  }, [])

  const handleScanComplete = useCallback((results) => {
    setMatchResults(results)
    setStep('review')
  }, [])

  const handleImportComplete = useCallback((stats) => {
    setImportStats(stats)
    setStep('complete')
  }, [])

  const handleDone = useCallback(() => {
    onComplete?.()
    onClose()
  }, [onComplete, onClose])

  const getTitle = () => {
    if (mode === 'export') return 'Export Library Bundle'
    switch (step) {
      case 'upload': return 'Import Library Bundle'
      case 'scan': return 'Scanning for PDFs'
      case 'review': return 'Review Import'
      case 'complete': return 'Import Complete'
      default: return 'Migration'
    }
  }

  const renderStep = () => {
    if (mode === 'export') {
      return (
        <ExportStep
          adapter={adapter}
          provider={provider}
          onComplete={handleExportComplete}
          onCancel={onClose}
        />
      )
    }

    switch (step) {
      case 'upload':
        return (
          <ImportUploadStep
            onBundleUploaded={handleBundleUploaded}
            onCancel={onClose}
          />
        )
      case 'scan':
        return (
          <ImportScanStep
            adapter={adapter}
            bundle={bundle}
            onComplete={handleScanComplete}
            onCancel={onClose}
          />
        )
      case 'review':
        return (
          <ImportReviewStep
            adapter={adapter}
            bundle={bundle}
            matchResults={matchResults}
            onComplete={handleImportComplete}
            onBack={() => setStep('upload')}
            onCancel={onClose}
          />
        )
      case 'complete':
        return (
          <ImportCompleteStep
            stats={importStats}
            onDone={handleDone}
          />
        )
      default:
        return null
    }
  }

  return (
    <Modal onClose={onClose} width={600}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>{getTitle()}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {renderStep()}
        </div>
      </div>
    </Modal>
  )
}
