import ReactMarkdown from 'react-markdown'

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
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith('#wiki-')) {
            const id = href.replace('#wiki-', '')
            const page = pagesById[id]
            return (
              <button
                type="button"
                title={page?.title || id}
                onClick={() => onOpenPage?.(id)}
                style={{ color: 'var(--accent)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
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
  )
}

export { renderWikiText }
