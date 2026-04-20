import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStorageStore } from '../../store/storageStore'
import { Spinner } from '../ui'
import styles from './MarkdownViewer.module.css'

/**
 * Strip YAML front-matter from a markdown string.
 */
function stripFrontMatter(md) {
  return md.replace(/^---[\s\S]*?---\n?/, '').trim()
}

export default function MarkdownViewer({ doc }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const adapter = useStorageStore((s) => s.adapter)
  const isConnected = useStorageStore((s) => s.isConnected)

  useEffect(() => {
    if (!doc || !adapter || !isConnected) return

    const mdPath = doc.ai_chat_source_file
    if (!mdPath || !mdPath.endsWith('.md')) {
      setError('No markdown file available')
      setLoading(false)
      return
    }

    let cancelled = false
    const fetchContent = async () => {
      setLoading(true)
      setError(null)
      try {
        const blob = await adapter.downloadFile(mdPath)
        const text = await blob.text()
        if (!cancelled) {
          setContent(stripFrontMatter(text))
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load markdown:', err)
          setError(err.message || 'Failed to load article')
          setLoading(false)
        }
      }
    }
    fetchContent()

    return () => { cancelled = true }
  }, [doc?.id, doc?.ai_chat_source_file, adapter, isConnected])

  if (loading) {
    return (
      <div className={styles.viewer}>
        <div className={styles.loading}>
          <Spinner size={32} />
          <span>Loading article...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.viewer}>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.viewer}>
      {/* Article header */}
      <div className={styles.articleHeader}>
        {doc.source_name && (
          <span className={styles.sourceBadge}>{doc.source_name}</span>
        )}
        {doc.published_at && (
          <span className={styles.date}>
            {new Date(doc.published_at).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </span>
        )}
        {doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.originalLink}
          >
            Open original
          </a>
        )}
      </div>

      {/* Markdown content */}
      <article className={styles.prose}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  )
}
