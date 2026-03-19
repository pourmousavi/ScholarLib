import { useState, useEffect, useRef, useCallback } from 'react'
import { useAIStore } from '../../store/aiStore'
import { useLibraryStore } from '../../store/libraryStore'
import { aiService } from '../../services/ai/AIService'
import { ollamaService } from '../../services/ai/OllamaService'
import { Btn } from '../ui'
import ScopeSelector from './ScopeSelector'
import styles from './ChatPanel.module.css'

const QUICK_PROMPTS = [
  'Summarise key findings',
  'What methods were used?',
  'List main conclusions',
  'Identify research gaps'
]

export default function ChatPanel() {
  const [input, setInput] = useState('')
  const [showDownload, setShowDownload] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState('')

  const messagesRef = useRef(null)
  const inputRef = useRef(null)

  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const isAvailable = useAIStore((s) => s.isAvailable)
  const isChecking = useAIStore((s) => s.isChecking)
  const messages = useAIStore((s) => s.messages)
  const isStreaming = useAIStore((s) => s.isStreaming)
  const streamingContent = useAIStore((s) => s.streamingContent)
  const scope = useAIStore((s) => s.scope)
  const error = useAIStore((s) => s.error)

  const addMessage = useAIStore((s) => s.addMessage)
  const setStreaming = useAIStore((s) => s.setStreaming)
  const setStreamingContent = useAIStore((s) => s.setStreamingContent)
  const appendStreamingContent = useAIStore((s) => s.appendStreamingContent)
  const updateLastMessage = useAIStore((s) => s.updateLastMessage)
  const setAvailable = useAIStore((s) => s.setAvailable)
  const setError = useAIStore((s) => s.setError)
  const clearError = useAIStore((s) => s.clearError)

  const selectedDocId = useLibraryStore((s) => s.selectedDocId)
  const documents = useLibraryStore((s) => s.documents)
  const selectedDoc = selectedDocId ? documents[selectedDocId] : null

  // Check Ollama availability on mount
  useEffect(() => {
    const checkAvailability = async () => {
      if (provider === 'ollama') {
        const available = await ollamaService.isAvailable()
        setAvailable(available)
      }
    }

    checkAvailability()
    // Check every 30 seconds
    const interval = setInterval(checkAvailability, 30000)
    return () => clearInterval(interval)
  }, [provider, setAvailable])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  // Handle sending a message
  const handleSend = useCallback(async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isStreaming) return

    clearError()
    setInput('')

    // Add user message
    addMessage({ role: 'user', content: trimmedInput })

    // Build messages array with system prompt
    const systemPrompt = aiService.buildSystemPrompt(scope, [])
    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: trimmedInput }
    ]

    // Start streaming
    setStreaming(true)
    setStreamingContent('')

    try {
      // Add placeholder for assistant message
      addMessage({ role: 'assistant', content: '' })

      let fullContent = ''
      for await (const chunk of aiService.streamChat(chatMessages)) {
        fullContent += chunk
        appendStreamingContent(chunk)
        updateLastMessage(fullContent)
      }

      setStreamingContent('')
    } catch (err) {
      console.error('Chat error:', err)
      setError(err.message || 'Failed to get AI response')
      // Remove the empty assistant message on error
      // (In a real app, we'd handle this more gracefully)
    } finally {
      setStreaming(false)
    }
  }, [input, isStreaming, messages, scope, addMessage, setStreaming, setStreamingContent, appendStreamingContent, updateLastMessage, clearError, setError])

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle quick prompt click
  const handleQuickPrompt = (prompt) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  // Handle WebLLM download
  const handleDownloadWebLLM = async () => {
    setShowDownload(true)
    setDownloadProgress(0)
    setDownloadStatus('Initializing...')

    try {
      await aiService.initializeWebLLM('Llama-3.2-3B-Instruct-q4f32_1-MLC', (report) => {
        setDownloadProgress(report.progress * 100)
        setDownloadStatus(report.text || 'Downloading...')
      })
      setAvailable(true)
      setShowDownload(false)
    } catch (err) {
      setError(err.message || 'Failed to download model')
      setShowDownload(false)
    }
  }

  // Get user initial for avatar
  const userInitial = 'U'

  // Render status indicator
  const renderStatus = () => {
    if (isChecking) {
      return (
        <div className={styles.status}>
          <span className={`${styles.statusDot} ${styles.loading}`} />
          <span>Checking...</span>
        </div>
      )
    }

    if (provider === 'ollama') {
      return (
        <div className={styles.status}>
          <span className={`${styles.statusDot} ${isAvailable ? styles.available : ''}`} />
          <span>{isAvailable ? model : 'Ollama offline'}</span>
        </div>
      )
    }

    if (provider === 'webllm') {
      const status = aiService.getWebLLMStatus()
      return (
        <div className={styles.status}>
          <span className={`${styles.statusDot} ${status.isReady ? styles.available : ''}`} />
          <span>{status.isReady ? 'WebLLM ready' : 'WebLLM'}</span>
        </div>
      )
    }

    return (
      <div className={styles.status}>
        <span className={styles.statusDot} />
        <span>No AI</span>
      </div>
    )
  }

  // Render error state
  if (error && messages.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <ScopeSelector />
          {renderStatus()}
        </div>
        <div className={styles.error}>
          <span className={styles.errorIcon}>!</span>
          <span className={styles.errorText}>{error}</span>
          <button className={styles.errorAction} onClick={clearError}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Render not available state
  if (!isAvailable && !isChecking && provider === 'ollama') {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <ScopeSelector />
          {renderStatus()}
        </div>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>AI</span>
          <span className={styles.emptyText}>Ollama is not running</span>
          <span className={styles.emptyHint}>
            Start Ollama with: ollama serve
            <br />
            Then run: ollama pull llama3.2
          </span>
        </div>
      </div>
    )
  }

  // Render WebLLM not ready state
  if (provider === 'webllm' && !aiService.getWebLLMStatus().isReady && !showDownload) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <ScopeSelector />
          {renderStatus()}
        </div>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>AI</span>
          <span className={styles.emptyText}>Download AI model to use chat</span>
          <span className={styles.emptyHint}>
            Llama 3.2 3B — approximately 2.1 GB
            <br />
            Downloaded once, stored in browser.
          </span>
          <Btn gold onClick={handleDownloadWebLLM} style={{ marginTop: 16 }}>
            Download & Enable
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <ScopeSelector />
        {renderStatus()}
      </div>

      {/* Messages */}
      <div className={styles.messages} ref={messagesRef}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>AI</span>
            <span className={styles.emptyText}>
              Ask questions about {selectedDoc?.metadata?.title || 'your documents'}
            </span>
            <span className={styles.emptyHint}>
              AI will search indexed documents and provide cited answers
            </span>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
              <div className={`${styles.avatar} ${styles[msg.role]}`}>
                {msg.role === 'assistant' ? '✦' : userInitial}
              </div>
              <div className={styles.content}>
                <div className={styles.bubble}>
                  {msg.content || (isStreaming && msg.role === 'assistant' ? (
                    <div className={styles.thinking}>
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                      <span className={styles.dot} />
                    </div>
                  ) : '')}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className={styles.quickPrompts}>
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              className={styles.quickPrompt}
              onClick={() => handleQuickPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            disabled={isStreaming}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || (!isAvailable && provider === 'ollama')}
          >
            {isStreaming ? '...' : 'S'}
          </button>
        </div>
      </div>

      {/* WebLLM Download Modal */}
      {showDownload && (
        <div className={styles.downloadModal}>
          <div className={styles.downloadCard}>
            <h3 className={styles.downloadTitle}>Downloading AI Model</h3>
            <p className={styles.downloadDesc}>
              Llama 3.2 3B is being downloaded to your browser.
              This only happens once.
            </p>
            <div className={styles.downloadProgress}>
              <div
                className={styles.downloadProgressBar}
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <div className={styles.downloadStatus}>
              {downloadStatus} — {downloadProgress.toFixed(0)}%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
