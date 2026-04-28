import { useEffect, useMemo, useState } from 'react'
import styles from '../Wiki.module.css'

const ID_PATTERN = /^(c|m|d|pe|p|g|q|po|a)_[0-9A-HJKMNP-TV-Z]{10,}$/i

function extractWikilinks(body) {
  const matches = String(body || '').matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)
  const ids = []
  for (const match of matches) ids.push(match[1].trim())
  return ids
}

function detectAliasLinks(body) {
  return extractWikilinks(body).filter((id) => !ID_PATTERN.test(id))
}

export default function ChangeEditDialog({ change, currentEdit, onSave, onCancel }) {
  const initialBody = currentEdit?.edited_body ?? change?.draft_body ?? ''
  const initialFrontmatter = currentEdit?.edited_frontmatter ?? change?.draft_frontmatter ?? {}
  const [body, setBody] = useState(initialBody)
  const [frontmatterText, setFrontmatterText] = useState(JSON.stringify(initialFrontmatter, null, 2))
  const [error, setError] = useState(null)

  useEffect(() => {
    setBody(initialBody)
    setFrontmatterText(JSON.stringify(initialFrontmatter, null, 2))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [change?.change_id])

  const aliasLinks = useMemo(() => detectAliasLinks(body), [body])

  const save = () => {
    if (aliasLinks.length > 0) {
      setError(`Alias-style wikilinks are not allowed: ${aliasLinks.map((id) => `[[${id}]]`).join(', ')}`)
      return
    }
    let parsedFm
    try {
      parsedFm = JSON.parse(frontmatterText)
    } catch (parseError) {
      setError(`Invalid frontmatter JSON: ${parseError.message}`)
      return
    }
    onSave?.({ edited_frontmatter: parsedFm, edited_body: body })
  }

  if (!change) return null

  return (
    <div role="dialog" aria-label="Edit change" className={styles.editDialogOverlay}>
      <div className={styles.editDialog}>
        <header className={styles.editDialogHeader}>
          <h3>Edit {change.page_type || 'page'}</h3>
          <button type="button" className={styles.iconBtn} onClick={onCancel} aria-label="Cancel">×</button>
        </header>
        <label className={styles.editDialogLabel}>
          <span>Frontmatter (JSON)</span>
          <textarea
            value={frontmatterText}
            onChange={(event) => setFrontmatterText(event.target.value)}
            className={styles.editDialogFrontmatter}
            spellCheck={false}
          />
        </label>
        <div className={styles.editDialogBodyGrid}>
          <label className={styles.editDialogLabel}>
            <span>Body (markdown)</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={styles.editDialogBody}
            />
          </label>
          <div className={styles.editDialogPreview}>
            <strong>Preview</strong>
            <pre className={styles.editDialogPreviewPre}>{body}</pre>
          </div>
        </div>
        {error && <p className={styles.editDialogError} role="alert">{error}</p>}
        <footer className={styles.editDialogFooter}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.primaryBtn} onClick={save}>Save edit</button>
        </footer>
      </div>
    </div>
  )
}

export { detectAliasLinks }
