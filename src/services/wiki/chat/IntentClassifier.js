import { ollamaService as defaultOllamaService } from '../../ai/OllamaService'

const VALID_PREFERENCES = new Set(['extractive', 'synthetic', 'mixed'])
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high'])

export const INTENT_CLASSIFIER_PROMPT = `You are classifying user research queries for retrieval routing.

Categories:
- extractive: query asks for exact text, equations, figures, specific citations,
  or specific paragraphs. Likely answered by reading source PDFs directly.
- synthetic: query asks for synthesis, comparison, gaps, position, or "what do I/we think about X".
  Likely answered by reading concept pages.
- mixed: query benefits from both. Most everyday research questions.

Examples:
- "Quote me equation 4.2 from Smith 2025" -> extractive
- "What's the consensus on FCAS revenue post-FPP?" -> synthetic
- "How does Zhang's calendar aging model compare to others?" -> mixed
- "Find figure 3 in the Jones paper" -> extractive
- "What gaps exist in BESS degradation modelling?" -> synthetic

Output JSON: { "preference": "...", "confidence": "...", "reasoning": "..." }`

function safeJson(text) {
  try {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    return JSON.parse(match ? match[0] : text)
  } catch {
    return null
  }
}

export function fallbackIntent(reasoning = 'Classifier unavailable or returned invalid output.') {
  return { preference: 'mixed', confidence: 'low', reasoning }
}

export class IntentClassifier {
  constructor({ ollamaService = defaultOllamaService, model = null } = {}) {
    this.ollamaService = ollamaService
    this.model = model
  }

  async classify(query, history = []) {
    try {
      if (typeof this.ollamaService?.chat !== 'function') return fallbackIntent()
      const response = await this.ollamaService.chat([
        { role: 'system', content: INTENT_CLASSIFIER_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            query,
            recent_history: history.slice(-4).map(message => ({ role: message.role, content: message.content })),
          }),
        },
      ], this.model || undefined, { format: 'json', temperature: 0 })
      return this.normalize(safeJson(response))
    } catch {
      return fallbackIntent()
    }
  }

  normalize(value) {
    if (!value || !VALID_PREFERENCES.has(value.preference) || !VALID_CONFIDENCE.has(value.confidence)) {
      return fallbackIntent('Classifier output was malformed or outside the allowed labels.')
    }
    return {
      preference: value.preference,
      confidence: value.confidence,
      reasoning: String(value.reasoning || '').slice(0, 500),
    }
  }
}
