import { ollamaService as defaultOllamaService } from '../../ai/OllamaService'

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
}

export class QueryRewriter {
  constructor({ ollamaService = defaultOllamaService, model = null } = {}) {
    this.ollamaService = ollamaService
    this.model = model
  }

  async rewrite(query, history = []) {
    try {
      if (typeof this.ollamaService?.chat !== 'function') return this.fallback(query)
      const response = await this.ollamaService.chat([
        { role: 'system', content: 'Rewrite the research query into 1-3 short retrieval queries. Output JSON: {"queries":["..."]}.' },
        { role: 'user', content: JSON.stringify({ query, history: history.slice(-3) }) },
      ], this.model || undefined, { format: 'json', temperature: 0 })
      const parsed = JSON.parse(String(response).match(/\{[\s\S]*\}/)?.[0] || response)
      return unique([query, ...(parsed.queries || [])]).slice(0, 3)
    } catch {
      return this.fallback(query)
    }
  }

  fallback(query) {
    const text = String(query || '').trim()
    const noQuestionWords = text.replace(/\b(what|how|why|does|do|is|are|the|a|an)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    return unique([text, noQuestionWords]).slice(0, 3)
  }
}
