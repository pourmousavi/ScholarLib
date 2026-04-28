import ReactMarkdown from 'react-markdown'
import SaveCandidateButton from '../wiki/chat/SaveCandidateButton'
import styles from './ChatPanel.module.css'

function provenanceLabel(provenance) {
  const wikiCount = provenance?.wiki?.page_count || provenance?.retrieval?.wiki?.pages?.length || 0
  const ragCount = provenance?.rag?.chunk_count || provenance?.retrieval?.rag?.chunks?.length || 0
  const improved = provenance?.improved_rag?.chunk_count > 0 || provenance?.routing?.use_improved_rag
  if (improved) return 'Improved-RAG'
  if (wikiCount > 0 && ragCount > 0) return 'From wiki + PDFs'
  if (wikiCount > 0) return 'From wiki'
  if (ragCount > 0) return 'From PDFs'
  return 'No retrieved sources'
}

function provenanceTitle(provenance) {
  if (!provenance) return ''
  return [
    `classifier: ${typeof provenance.classification === 'string' ? provenance.classification : provenance.classification?.preference || 'unknown'}`,
    `wiki: ${provenance.retrieval?.wiki?.confidence || 'none'}`,
    `rag chunks: ${provenance.rag?.chunk_count ?? provenance.retrieval?.rag?.chunks?.length ?? 0}`,
    `cost: $${Number(provenance.cost_estimate_usd || 0).toFixed(4)}`,
  ].join('\n')
}

export default function MessageRenderer({ message, isStreaming, adapter, question }) {
  const isAssistant = message.role === 'assistant'
  return (
    <>
      {message.content ? (
        isAssistant ? (
          <div className={styles.markdown}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : (
          message.content
        )
      ) : (isStreaming && isAssistant ? (
        <div className={styles.thinking}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      ) : '')}
      {isAssistant && message.provenance && (
        <div className={styles.provenanceRow}>
          <span className={styles.provenanceBadge} title={provenanceTitle(message.provenance)}>
            {provenanceLabel(message.provenance)}
          </span>
          <SaveCandidateButton
            adapter={adapter}
            question={question}
            answer={message.content}
            provenance={message.provenance}
          />
        </div>
      )}
    </>
  )
}

export { provenanceLabel }
