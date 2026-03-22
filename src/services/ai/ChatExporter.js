import jsPDF from 'jspdf'
import { settingsService } from '../settings/SettingsService'

/**
 * ChatExporter - Export chat conversations in multiple formats
 */
class ChatExporter {
  /**
   * Get export options from settings
   */
  getOptions() {
    // Read from localStorage since settings might not be loaded
    const stored = localStorage.getItem('sv_chat_export_options')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        // Use defaults
      }
    }
    return {
      includeCitations: true,
      includeTimestamps: false
    }
  }

  /**
   * Save export options to localStorage
   */
  setOptions(options) {
    localStorage.setItem('sv_chat_export_options', JSON.stringify(options))
  }
  /**
   * Format a date for display
   */
  formatDate(dateStr) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Export conversation as Markdown
   * @param {object} conversation - Conversation object
   * @returns {string}
   */
  exportAsMarkdown(conversation) {
    const options = this.getOptions()
    const lines = [
      `# ${conversation.title}`,
      '',
      `**Date:** ${this.formatDate(conversation.created_at)}`,
      `**Scope:** ${conversation.scope?.description || 'Unknown'}`,
      `**Model:** ${conversation.model} (${conversation.provider})`,
      ''
    ]

    if (conversation.token_usage?.cost_usd > 0) {
      lines.push(`**Tokens:** ${conversation.token_usage.prompt_tokens + conversation.token_usage.completion_tokens} · Cost: $${conversation.token_usage.cost_usd.toFixed(4)}`)
      lines.push('')
    }

    lines.push('---', '')

    for (const msg of conversation.messages) {
      const role = msg.role === 'user' ? 'You' : 'AI'
      lines.push(`## ${role}`)

      if (options.includeTimestamps && msg.timestamp) {
        lines.push(`*${this.formatDate(msg.timestamp)}*`)
      }

      lines.push('')
      lines.push(msg.content)

      if (options.includeCitations && msg.citations?.length) {
        lines.push('')
        lines.push(`*References: ${msg.citations.map(c => c.citation).join(', ')}*`)
      }

      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Export conversation as plain text
   * @param {object} conversation - Conversation object
   * @returns {string}
   */
  exportAsText(conversation) {
    const options = this.getOptions()
    const lines = [
      conversation.title,
      '='.repeat(conversation.title.length),
      '',
      `Date: ${this.formatDate(conversation.created_at)}`,
      `Scope: ${conversation.scope?.description || 'Unknown'}`,
      `Model: ${conversation.model} (${conversation.provider})`,
      '',
      '-'.repeat(40),
      ''
    ]

    for (const msg of conversation.messages) {
      const role = msg.role === 'user' ? 'You' : 'AI'
      let header = `[${role}]`
      if (options.includeTimestamps && msg.timestamp) {
        header += ` ${this.formatDate(msg.timestamp)}`
      }
      lines.push(header)
      lines.push(msg.content)

      if (options.includeCitations && msg.citations?.length) {
        lines.push(`References: ${msg.citations.map(c => c.citation).join(', ')}`)
      }

      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Export conversation as HTML
   * @param {object} conversation - Conversation object
   * @returns {string}
   */
  exportAsHTML(conversation) {
    const escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>')
    }

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(conversation.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #1a1a1a; border-bottom: 2px solid #d4af64; padding-bottom: 10px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 20px; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .user { background: #f0f0f0; }
    .assistant { background: #faf8f3; border-left: 3px solid #d4af64; }
    .role { font-weight: 600; margin-bottom: 8px; color: #555; }
    .citations { font-size: 12px; color: #888; margin-top: 10px; font-style: italic; }
  </style>
</head>
<body>
  <h1>${escapeHtml(conversation.title)}</h1>
  <div class="meta">
    <p><strong>Date:</strong> ${this.formatDate(conversation.created_at)}</p>
    <p><strong>Scope:</strong> ${escapeHtml(conversation.scope?.description || 'Unknown')}</p>
    <p><strong>Model:</strong> ${escapeHtml(conversation.model)} (${escapeHtml(conversation.provider)})</p>
  </div>
`

    for (const msg of conversation.messages) {
      const roleClass = msg.role === 'user' ? 'user' : 'assistant'
      const roleLabel = msg.role === 'user' ? 'You' : 'AI'

      html += `  <div class="message ${roleClass}">
    <div class="role">${roleLabel}</div>
    <div class="content">${escapeHtml(msg.content)}</div>
`

      if (msg.citations?.length) {
        html += `    <div class="citations">References: ${msg.citations.map(c => escapeHtml(c.citation)).join(', ')}</div>
`
      }

      html += `  </div>
`
    }

    html += `</body>
</html>`

    return html
  }

  /**
   * Export conversation as JSON
   * @param {object} conversation - Conversation object
   * @returns {string}
   */
  exportAsJSON(conversation) {
    return JSON.stringify(conversation, null, 2)
  }

  /**
   * Export conversation as PDF
   * @param {object} conversation - Conversation object
   */
  exportAsPDF(conversation) {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const maxWidth = pageWidth - margin * 2
    let y = margin

    // Title
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    const titleLines = doc.splitTextToSize(conversation.title, maxWidth)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 8 + 5

    // Meta
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Date: ${this.formatDate(conversation.created_at)}`, margin, y)
    y += 5
    doc.text(`Scope: ${conversation.scope?.description || 'Unknown'}`, margin, y)
    y += 5
    doc.text(`Model: ${conversation.model} (${conversation.provider})`, margin, y)
    y += 10

    // Line
    doc.setDrawColor(200)
    doc.line(margin, y, pageWidth - margin, y)
    y += 10

    // Messages
    doc.setTextColor(0)
    for (const msg of conversation.messages) {
      // Check if we need a new page
      if (y > 270) {
        doc.addPage()
        y = margin
      }

      // Role
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(msg.role === 'user' ? 'You' : 'AI', margin, y)
      y += 6

      // Content
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const contentLines = doc.splitTextToSize(msg.content, maxWidth)

      for (const line of contentLines) {
        if (y > 280) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 5
      }

      y += 8
    }

    // Save
    const filename = `${conversation.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`
    doc.save(filename)
  }

  /**
   * Download a file
   * @param {string} content - File content
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Export conversation in specified format
   * @param {object} conversation - Conversation object
   * @param {string} format - Export format (markdown, text, html, json, pdf)
   */
  export(conversation, format) {
    const safeTitle = conversation.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()

    switch (format) {
      case 'markdown': {
        const content = this.exportAsMarkdown(conversation)
        this.downloadFile(content, `${safeTitle}.md`, 'text/markdown')
        break
      }
      case 'text': {
        const content = this.exportAsText(conversation)
        this.downloadFile(content, `${safeTitle}.txt`, 'text/plain')
        break
      }
      case 'html': {
        const content = this.exportAsHTML(conversation)
        this.downloadFile(content, `${safeTitle}.html`, 'text/html')
        break
      }
      case 'json': {
        const content = this.exportAsJSON(conversation)
        this.downloadFile(content, `${safeTitle}.json`, 'application/json')
        break
      }
      case 'pdf': {
        this.exportAsPDF(conversation)
        break
      }
      default:
        throw new Error(`Unknown export format: ${format}`)
    }
  }

  /**
   * Export all conversations
   * @param {object[]} conversations - Array of conversations
   * @param {string} format - Export format
   */
  exportAll(conversations, format) {
    if (format === 'json') {
      const content = JSON.stringify({ conversations }, null, 2)
      this.downloadFile(content, 'chat-history.json', 'application/json')
    } else {
      // For other formats, export as a single combined file
      let combined = ''

      for (const conv of conversations) {
        switch (format) {
          case 'markdown':
            combined += this.exportAsMarkdown(conv) + '\n\n---\n\n'
            break
          case 'text':
            combined += this.exportAsText(conv) + '\n\n' + '='.repeat(40) + '\n\n'
            break
          default:
            break
        }
      }

      if (format === 'markdown') {
        this.downloadFile(combined, 'chat-history.md', 'text/markdown')
      } else if (format === 'text') {
        this.downloadFile(combined, 'chat-history.txt', 'text/plain')
      }
    }
  }
}

export const chatExporter = new ChatExporter()
