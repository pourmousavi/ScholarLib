import { useState, useEffect } from 'react'
import { useAIStore } from '../../store/aiStore'
import { useStorageStore } from '../../store/storageStore'
import { chatHistoryService } from '../../services/ai/ChatHistoryService'
import { chatExporter } from '../../services/ai/ChatExporter'
import { useToast } from '../../hooks/useToast'
import Modal from '../ui/Modal'
import styles from './ChatHistoryModal.module.css'

const EXPORT_FORMATS = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'text', label: 'Plain Text' },
  { id: 'html', label: 'HTML' },
  { id: 'json', label: 'JSON' },
  { id: 'pdf', label: 'PDF' }
]

export default function ChatHistoryModal({ onClose, onLoadConversation }) {
  const [conversations, setConversations] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [exportMenuOpen, setExportMenuOpen] = useState(null)

  const adapter = useStorageStore((s) => s.adapter)
  const isDemoMode = useStorageStore((s) => s.isDemoMode)

  const { showToast } = useToast()

  // Load conversations on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await chatHistoryService.load(isDemoMode ? null : adapter)
        setConversations(history.conversations || [])
      } catch (error) {
        console.error('Failed to load chat history:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [adapter, isDemoMode])

  // Filter conversations by search
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery.trim()) return true

    const query = searchQuery.toLowerCase()
    return (
      conv.title.toLowerCase().includes(query) ||
      conv.scope?.description?.toLowerCase().includes(query) ||
      conv.model?.toLowerCase().includes(query)
    )
  })

  const formatDate = (dateStr) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now - date) / 86400000)

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const handleLoadConversation = (conv) => {
    console.log('Loading conversation:', conv.id, 'with', conv.messages?.length, 'messages')
    console.log('Full conversation:', JSON.stringify(conv, null, 2))
    onLoadConversation(conv)
    onClose()
  }

  const handleExport = (conv, format) => {
    try {
      chatExporter.export(conv, format)
      showToast({ message: `Exported as ${format.toUpperCase()}`, type: 'success' })
    } catch (error) {
      showToast({ message: 'Export failed', type: 'error' })
    }
    setExportMenuOpen(null)
  }

  const handleExportAll = (format) => {
    try {
      chatExporter.exportAll(conversations, format)
      showToast({ message: `Exported all conversations`, type: 'success' })
    } catch (error) {
      showToast({ message: 'Export failed', type: 'error' })
    }
  }

  const handleDelete = async (convId) => {
    if (!confirm('Delete this conversation?')) return

    try {
      await chatHistoryService.deleteConversation(isDemoMode ? null : adapter, convId)
      setConversations(prev => prev.filter(c => c.id !== convId))
      showToast({ message: 'Conversation deleted', type: 'success' })
    } catch (error) {
      showToast({ message: 'Failed to delete', type: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} width={700}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h2>Chat History</h2>
          <button className={styles.closeBtn} onClick={onClose}>x</button>
        </div>

        {/* Search and actions */}
        <div className={styles.toolbar}>
          <input
            type="text"
            className={styles.search}
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className={styles.toolbarActions}>
            <button
              className={styles.exportAllBtn}
              onClick={() => handleExportAll('json')}
              disabled={conversations.length === 0}
            >
              Export All
            </button>
          </div>
        </div>

        {/* Conversations list */}
        <div className={styles.list}>
          {isLoading ? (
            <div className={styles.loading}>Loading history...</div>
          ) : filteredConversations.length === 0 ? (
            <div className={styles.empty}>
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div key={conv.id} className={styles.conversation}>
                <div
                  className={styles.convMain}
                  onClick={() => handleLoadConversation(conv)}
                >
                  <div className={styles.convTitle}>{conv.title}</div>
                  <div className={styles.convMeta}>
                    <span className={styles.convDate}>{formatDate(conv.created_at)}</span>
                    <span className={styles.convDot}>·</span>
                    <span className={styles.convScope}>{conv.scope?.description || 'Unknown'}</span>
                    <span className={styles.convDot}>·</span>
                    <span className={styles.convModel}>{conv.model}</span>
                    <span className={styles.convDot}>·</span>
                    <span className={styles.convCount}>{conv.messages.length} messages</span>
                  </div>
                  {conv.token_usage?.cost_usd > 0 && (
                    <div className={styles.convCost}>
                      {(conv.token_usage.prompt_tokens + conv.token_usage.completion_tokens).toLocaleString()} tokens · ${conv.token_usage.cost_usd.toFixed(4)}
                    </div>
                  )}
                </div>
                <div className={styles.convActions}>
                  <div className={styles.exportWrapper}>
                    <button
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        setExportMenuOpen(exportMenuOpen === conv.id ? null : conv.id)
                      }}
                    >
                      v
                    </button>
                    {exportMenuOpen === conv.id && (
                      <div className={styles.exportMenu}>
                        {EXPORT_FORMATS.map(fmt => (
                          <button
                            key={fmt.id}
                            className={styles.exportOption}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExport(conv, fmt.id)
                            }}
                          >
                            {fmt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(conv.id)
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerText}>
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </Modal>
  )
}
