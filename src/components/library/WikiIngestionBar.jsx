import { useWikiIngestStore } from '../../store/wikiIngestStore'
import styles from './IndexingBar.module.css'

const STAGE_WEIGHTS = {
  preparing: 0.1,
  extracting: 0.6,
  building: 0.3,
  writing: 0.3,
}

const STAGE_ORDER = {
  paper: ['preparing', 'extracting', 'building'],
  grant: ['preparing', 'extracting', 'writing'],
}

const STAGE_TEXT = {
  paper: {
    preparing: 'Preparing wiki...',
    extracting: 'Extracting paper with model...',
    building: 'Building wiki proposal...',
  },
  grant: {
    preparing: 'Preparing wiki...',
    extracting: 'Extracting grant with model...',
    writing: 'Writing grant page...',
  },
}

function truncateName(name, maxLength = 35) {
  if (!name) return 'document'
  if (name.length <= maxLength) return name
  return name.substring(0, maxLength - 3) + '...'
}

export default function WikiIngestionBar() {
  const isIngesting = useWikiIngestStore((s) => s.isIngesting)
  const mode = useWikiIngestStore((s) => s.mode)
  const currentStage = useWikiIngestStore((s) => s.currentStage)
  const currentDocName = useWikiIngestStore((s) => s.currentDocName)
  const error = useWikiIngestStore((s) => s.error)
  const clearError = useWikiIngestStore((s) => s.clearError)

  if (!isIngesting && !error) return null

  if (error && !isIngesting) {
    return (
      <div className={`${styles.bar} ${styles.error}`} onClick={clearError}>
        <div className={styles.content}>
          <span className={styles.icon}>⚠</span>
          <span className={styles.message}>Wiki ingestion failed: {error}</span>
        </div>
      </div>
    )
  }

  const order = STAGE_ORDER[mode] || STAGE_ORDER.paper
  let baseProgress = 0
  for (const stage of order) {
    if (stage === currentStage) break
    baseProgress += STAGE_WEIGHTS[stage] || 0
  }
  baseProgress += (STAGE_WEIGHTS[currentStage] || 0) * 0.5
  const progressPercent = Math.min(99, Math.round(baseProgress * 100))

  const stageLabel = STAGE_TEXT[mode]?.[currentStage] || 'Working...'
  const verb = mode === 'grant' ? 'Ingesting grant' : 'Ingesting'

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
              {verb}: {truncateName(currentDocName)}
            </span>
            <span className={styles.stage}>{stageLabel}</span>
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
