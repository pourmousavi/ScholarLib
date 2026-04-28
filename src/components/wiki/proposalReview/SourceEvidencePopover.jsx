import { useEffect, useRef } from 'react'
import styles from '../Wiki.module.css'

export default function SourceEvidencePopover({ claim, anchor, onClose, onOpenPdf }) {
  const ref = useRef(null)
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape' || event.key === 's') {
        event.preventDefault()
        onClose?.()
      }
    }
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose?.()
    }
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  if (!claim) return null
  const evidence = claim.supported_by?.[0] || {}
  const isSensitive = evidence.quote_snippet === null || evidence.quote_snippet === undefined
  const sourceTitle = claim.source_title || claim.source?.title || claim.source_doc_id || 'Source'
  const page = evidence.pdf_page ?? evidence.page ?? null

  const open = () => {
    if (!onOpenPdf) return
    onOpenPdf({ scholarlib_doc_id: claim.scholarlib_doc_id || claim.source_doc_id || null, page })
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Source evidence"
      className={styles.sourcePopover}
      data-anchor={anchor || ''}
    >
      <header className={styles.sourcePopoverHeader}>
        <span>{sourceTitle}</span>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close evidence">×</button>
      </header>
      {isSensitive ? (
        <p className={styles.sourcePopoverSensitive}>Snippet hidden (sensitive source). Open PDF to view evidence.</p>
      ) : (
        <blockquote className={styles.sourceQuote}>{evidence.quote_snippet}</blockquote>
      )}
      <dl className={styles.sourceMeta}>
        {page != null && (<><dt>Page</dt><dd>{page}</dd></>)}
        {evidence.char_start != null && (<><dt>Char range</dt><dd>{evidence.char_start}–{evidence.char_end}</dd></>)}
        {claim.verifier_status && (<><dt>Verifier</dt><dd>{claim.verifier_status}</dd></>)}
        {claim.verifier?.justification && (<><dt>Justification</dt><dd>{claim.verifier.justification}</dd></>)}
        {evidence.page_text_hash && (<><dt>page hash</dt><dd className={styles.sourceMono}>{evidence.page_text_hash}</dd></>)}
        {evidence.span_text_hash && (<><dt>span hash</dt><dd className={styles.sourceMono}>{evidence.span_text_hash}</dd></>)}
      </dl>
      {onOpenPdf && (
        <button type="button" className={styles.secondaryBtn} onClick={open}>
          Open PDF{page != null ? ` at page ${page}` : ''}
        </button>
      )}
    </div>
  )
}
