import ReactMarkdown from 'react-markdown'
import styles from './PageReader.module.css'

function renderWikiText(text, pagesById = {}) {
  const parts = []
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let last = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const id = match[1]
    const display = match[2] || pagesById[id]?.title || id
    parts.push(`[${display}](#wiki-${id})`)
    last = match.index + match[0].length
  }
  parts.push(text.slice(last))
  return parts.join('')
}

export default function PageReader({ body, pagesById = {}, onOpenPage }) {
  return (
    <div className={styles.body}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#wiki-')) {
              const id = href.replace('#wiki-', '')
              const page = pagesById[id]
              const missing = !page
              return (
                <button
                  type="button"
                  title={page?.title || id}
                  data-broken-wikilink={missing ? 'true' : undefined}
                  onClick={() => onOpenPage?.(id)}
                  style={{ color: missing ? 'var(--error)' : 'var(--accent)', background: 'none', border: 0, padding: 0, cursor: missing ? 'help' : 'pointer' }}
                >
                  {children}
                </button>
              )
            }
            return <a href={href}>{children}</a>
          }
        }}
      >
        {renderWikiText(body || '', pagesById)}
      </ReactMarkdown>
    </div>
  )
}

export { renderWikiText }
