import { useState } from 'react'
import { USEFULNESS_MILESTONES, shouldPromptForCheckIn } from '../../services/wiki/phase1/UsefulnessService'
import styles from './Wiki.module.css'

export default function UsefulnessPrompt({
  paperCount = 0,
  existingRatings = [],
  service,
  onRecorded,
  onDismiss,
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const visible = shouldPromptForCheckIn(paperCount, existingRatings)
  if (!visible) return null

  const submit = async () => {
    if (rating < 1) return
    setSubmitting(true)
    try {
      const record = await service?.recordRating({ rating, paperIndex: paperCount, comment })
      onRecorded?.(record)
    } finally {
      setSubmitting(false)
    }
  }

  const milestoneIndex = USEFULNESS_MILESTONES.indexOf(paperCount) + 1
  const milestoneTotal = USEFULNESS_MILESTONES.length

  return (
    <aside role="status" aria-label="usefulness check-in" className={styles.usefulness}>
      <header>
        <h3>Usefulness check-in {milestoneIndex > 0 ? `(${milestoneIndex}/${milestoneTotal})` : ''}</h3>
        <button type="button" aria-label="dismiss" onClick={() => onDismiss?.()} className={styles.iconBtn}>
          ×
        </button>
      </header>
      <p>
        How useful has the wiki been in any actual writing you've done since the last check-in?
        Please be honest with yourself — over-rating now produces a project that fails at Phase 5.
      </p>
      <div className={styles.usefulnessRating} role="radiogroup" aria-label="rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            className={`${styles.usefulnessStar} ${rating >= value ? styles.usefulnessStarActive : ''}`}
            onClick={() => setRating(value)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        placeholder="Optional comment — anything specific that helped or did not help?"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        aria-label="comment"
      />
      <div className={styles.usefulnessActions}>
        <button type="button" className={styles.secondaryBtn} onClick={() => onDismiss?.()}>
          Skip for now
        </button>
        <button type="button" className={styles.primaryBtn} disabled={rating < 1 || submitting} onClick={submit}>
          {submitting ? 'Saving...' : 'Submit rating'}
        </button>
      </div>
    </aside>
  )
}
