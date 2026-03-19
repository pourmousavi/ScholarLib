import { useIndexStore } from '../../store/indexStore'
import styles from './PendingNotice.module.css'

export default function PendingNotice({ count, onIndexNow }) {
  const isIndexing = useIndexStore((s) => s.isIndexing)
  const currentStage = useIndexStore((s) => s.currentStage)
  const progress = useIndexStore((s) => s.progress)
  const currentChunk = useIndexStore((s) => s.currentChunk)
  const totalChunks = useIndexStore((s) => s.totalChunks)

  if (count === 0 && !isIndexing) return null

  // Show indexing progress
  if (isIndexing) {
    const stageText = {
      extracting: 'Extracting text...',
      chunking: 'Chunking...',
      embedding: `Embedding ${currentChunk}/${totalChunks}`,
      saving: 'Saving index...',
      complete: 'Complete!'
    }

    return (
      <div className={`${styles.notice} ${styles.indexing}`}>
        <span className={styles.icon}>⚡</span>
        <span className={styles.text}>
          {stageText[currentStage] || 'Indexing...'}
        </span>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.notice}>
      <span className={styles.icon}>O</span>
      <span className={styles.text}>
        {count} document{count !== 1 ? 's' : ''} pending AI indexing
      </span>
      <button className={styles.action} onClick={onIndexNow}>
        Index now
      </button>
    </div>
  )
}
