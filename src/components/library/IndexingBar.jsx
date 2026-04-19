import { useIndexStore } from '../../store/indexStore'
import styles from './IndexingBar.module.css'

export default function IndexingBar({ pendingDocs, mismatchedDocs, onIndexAll, onReindexMismatched }) {
  const isIndexing = useIndexStore((s) => s.isIndexing)
  const currentStage = useIndexStore((s) => s.currentStage)
  const progress = useIndexStore((s) => s.progress)
  const currentChunk = useIndexStore((s) => s.currentChunk)
  const totalChunks = useIndexStore((s) => s.totalChunks)
  const currentDocName = useIndexStore((s) => s.currentDocName)
  const batchMode = useIndexStore((s) => s.batchMode)
  const batchTotal = useIndexStore((s) => s.batchTotal)
  const batchCurrent = useIndexStore((s) => s.batchCurrent)
  const error = useIndexStore((s) => s.error)

  const pendingCount = pendingDocs?.length || 0
  const mismatchedCount = mismatchedDocs?.length || 0

  // Nothing to show
  if (pendingCount === 0 && mismatchedCount === 0 && !isIndexing && !error) {
    return null
  }

  // Stage text mapping
  const getStageText = () => {
    switch (currentStage) {
      case 'extracting':
        return 'Extracting text...'
      case 'chunking':
        return 'Processing text...'
      case 'embedding':
        return totalChunks > 0
          ? `Creating embeddings (${currentChunk}/${totalChunks})`
          : 'Creating embeddings...'
      case 'saving':
        return 'Saving to index...'
      case 'complete':
        return 'Complete!'
      default:
        return 'Preparing...'
    }
  }

  // Calculate overall progress percentage
  const getOverallProgress = () => {
    if (!isIndexing) return 0

    // Weight each stage
    const stageWeights = {
      extracting: 0.1,
      chunking: 0.1,
      embedding: 0.7,
      saving: 0.1
    }

    let baseProgress = 0
    switch (currentStage) {
      case 'extracting':
        baseProgress = 0
        break
      case 'chunking':
        baseProgress = stageWeights.extracting
        break
      case 'embedding':
        baseProgress = stageWeights.extracting + stageWeights.chunking
        break
      case 'saving':
        baseProgress = stageWeights.extracting + stageWeights.chunking + stageWeights.embedding
        break
      case 'complete':
        return 100
      default:
        return 0
    }

    // Add stage-specific progress for embedding
    if (currentStage === 'embedding' && totalChunks > 0) {
      const embeddingProgress = (currentChunk / totalChunks) * stageWeights.embedding
      baseProgress += embeddingProgress
    }

    return Math.round(baseProgress * 100)
  }

  // Truncate document name
  const truncateName = (name, maxLength = 35) => {
    if (!name) return 'document'
    if (name.length <= maxLength) return name
    return name.substring(0, maxLength - 3) + '...'
  }

  // Error state
  if (error && !isIndexing) {
    return (
      <div className={`${styles.bar} ${styles.error}`}>
        <div className={styles.content}>
          <span className={styles.icon}>⚠</span>
          <span className={styles.message}>Indexing failed: {error}</span>
        </div>
      </div>
    )
  }

  // Indexing in progress
  if (isIndexing) {
    const progressPercent = getOverallProgress()

    return (
      <div className={`${styles.bar} ${styles.indexing}`}>
        <div className={styles.content}>
          <div className={styles.statusSection}>
            <span className={styles.icon}>
              <svg className={styles.spinner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
              </svg>
            </span>
            <div className={styles.textContent}>
              <span className={styles.docName}>
                {batchMode && batchTotal > 1
                  ? `Indexing ${batchCurrent + 1} of ${batchTotal}: `
                  : 'Indexing: '}
                {truncateName(currentDocName)}
              </span>
              <span className={styles.stage}>{getStageText()}</span>
            </div>
          </div>
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={styles.percent}>{progressPercent}%</span>
          </div>
        </div>
      </div>
    )
  }

  // Pending documents - show index all prompt
  if (pendingCount > 0) {
    return (
      <div className={`${styles.bar} ${styles.pending}`}>
        <div className={styles.content}>
          <div className={styles.statusSection}>
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </span>
            <span className={styles.message}>
              <strong>{pendingCount}</strong> document{pendingCount !== 1 ? 's' : ''} not indexed for AI chat
            </span>
          </div>
          <button className={styles.indexAllBtn} onClick={onIndexAll}>
            Index {pendingCount === 1 ? 'Document' : 'All'}
          </button>
        </div>
      </div>
    )
  }

  // Documents indexed with a different embedding model
  if (mismatchedCount > 0) {
    return (
      <div className={`${styles.bar} ${styles.mismatch}`}>
        <div className={styles.content}>
          <div className={styles.statusSection}>
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            <div className={styles.mismatchText}>
              <span className={styles.message}>
                <strong>{mismatchedCount}</strong> document{mismatchedCount !== 1 ? 's' : ''} indexed with a different embedding model — AI chat won't work until re-indexed
              </span>
              <span className={styles.legend}>
                <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'var(--success)' }} /> ready</span>
                <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'rgb(251, 146, 60)' }} /> wrong model</span>
                <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: 'var(--text-muted)' }} /> not indexed</span>
              </span>
            </div>
          </div>
          <button className={styles.indexAllBtn} onClick={onReindexMismatched}>
            Re-index {mismatchedCount === 1 ? 'Document' : 'All'}
          </button>
        </div>
      </div>
    )
  }

  return null
}
