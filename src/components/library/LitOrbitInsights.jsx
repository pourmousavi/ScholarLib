import { useState } from 'react'
import styles from './LitOrbitInsights.module.css'

const ACTION_STYLES = {
  'Read Fully': 'actionRead',
  'Skim': 'actionSkim',
  'Monitor': 'actionMonitor',
}

export default function LitOrbitInsights({ importSource }) {
  const [collapsed, setCollapsed] = useState(false)

  const score = importSource?.litorbit_score
  const summary = importSource?.litorbit_summary

  if (score == null && !summary) return null

  return (
    <div className={styles.container}>
      <button
        className={styles.header}
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <span className={styles.headerLabel}>LitOrbit Insights</span>
        <span className={styles.chevron}>{collapsed ? '+' : '\u2013'}</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          {score != null && (
            <div className={styles.scoreRow}>
              <span className={styles.fieldLabel}>Relevance Score</span>
              <span className={styles.scoreValue}>{score}</span>
              <span className={styles.scoreMax}> / 10</span>
            </div>
          )}

          {summary?.research_gap && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Research Gap</span>
              <p className={styles.fieldValue}>{summary.research_gap}</p>
            </div>
          )}

          {summary?.methodology && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Methodology</span>
              <p className={styles.fieldValue}>{summary.methodology}</p>
            </div>
          )}

          {summary?.key_findings && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Key Findings</span>
              <p className={styles.fieldValue}>{summary.key_findings}</p>
            </div>
          )}

          {summary?.relevance_to_energy_group && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Relevance</span>
              <p className={styles.fieldValue}>{summary.relevance_to_energy_group}</p>
            </div>
          )}

          {summary?.suggested_action && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Suggested Action</span>
              <span className={`${styles.actionBadge} ${styles[ACTION_STYLES[summary.suggested_action]] || ''}`}>
                {summary.suggested_action}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
