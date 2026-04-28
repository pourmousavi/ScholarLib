import { ollamaService } from '../../ai/OllamaService'
import { claudeService } from '../../ai/ClaudeService'
import { openaiService } from '../../ai/OpenAIService'
import { geminiService } from '../../ai/GeminiService'
import { ProviderRouter } from '../ProviderRouter'
import { WikiSchemaService } from '../WikiSchemaService'
import { hashMarkdown } from '../WikiHash'
import { PdfTextExtractor } from './PdfTextExtractor'

export class WikiExtractionValidationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'WikiExtractionValidationError'
    this.code = 'WIKI_EXTRACTION_VALIDATION_ERROR'
    this.details = details
  }
}

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4)
}

function getDocumentSensitivity(doc) {
  const namespace = doc?.wiki?.namespace || doc?.namespace || ''
  const sensitivity = doc?.wiki?.sensitivity || (namespace.startsWith('_private/') ? 'confidential' : 'public')
  const allowedProviders = doc?.wiki?.allowed_providers || (sensitivity === 'confidential' ? ['ollama'] : ['ollama', 'claude', 'openai', 'gemini'])
  return { sensitivity, allowedProviders, namespace }
}

function parseModelJson(raw) {
  const text = String(raw || '').trim()
  try { return JSON.parse(text) } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced) return JSON.parse(fenced[1].trim())
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new WikiExtractionValidationError('Model did not return valid JSON', { preview: text.slice(0, 500) })
  }
}

function coerceArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function normalizeConfidence(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium'
}

function stringifyDraftSection(value) {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(stringifyDraftSection).filter(Boolean).join('\n\n')
  if (typeof value !== 'object') return String(value)

  const title = value.title || value.heading || value.name
  const body = value.body ?? value.content ?? value.text ?? value.summary ?? value.abstract
  const rendered = stringifyDraftSection(body)
  if (title && rendered) return `## ${title}\n\n${rendered}`
  if (rendered) return rendered
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
}

function normalizeDraftBody(value, doc = {}) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map((item) => normalizeDraftBody(item, doc)).filter(Boolean).join('\n\n')
  if (value && typeof value === 'object') {
    const parts = []
    const title = value.title || doc.metadata?.title
    if (title) parts.push(`# ${title}`)
    for (const key of ['summary', 'abstract', 'body', 'markdown', 'content']) {
      if (typeof value[key] === 'string' && value[key].trim()) parts.push(value[key].trim())
    }
    for (const section of coerceArray(value.sections)) {
      const rendered = stringifyDraftSection(section)
      if (rendered) parts.push(rendered)
    }
    if (parts.length) return parts.join('\n\n')
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``
  }
  return `# ${doc.metadata?.title || 'Untitled paper'}\n\nNo structured summary was returned by the model.`
}

function normalizeClaimShape(claim) {
  if (!claim || typeof claim !== 'object') return null
  const claimText = claim.claim_text ?? claim.text ?? claim.claim ?? claim.statement
  if (!claimText) return null
  return {
    ...claim,
    claim_text: String(claimText),
    confidence: normalizeConfidence(claim.confidence),
    supported_by: coerceArray(claim.supported_by ?? claim.evidence ?? claim.locators).filter((locator) => locator && typeof locator === 'object'),
  }
}

function normalizeExtractionShape(value, doc = {}) {
  if (!value || typeof value !== 'object') throw new WikiExtractionValidationError('Extraction output must be an object')
  const source = value.paper && typeof value.paper === 'object' && !value.draft_body ? { ...value, ...value.paper } : value
  const requiredArrays = ['methods_used', 'datasets_used', 'concepts_touched', 'open_question_candidates', 'contradiction_signals']
  const normalized = {
    ...source,
    draft_frontmatter: source.draft_frontmatter && typeof source.draft_frontmatter === 'object' ? { ...source.draft_frontmatter } : {},
    draft_body: normalizeDraftBody(source.draft_body ?? source.body ?? source.markdown ?? source.summary ?? source.abstract, doc),
    claims: coerceArray(source.claims).map(normalizeClaimShape).filter(Boolean),
    extraction_metadata: source.extraction_metadata && typeof source.extraction_metadata === 'object' ? source.extraction_metadata : {},
  }
  normalized.draft_frontmatter.title ||= doc.metadata?.title || 'Untitled paper'
  normalized.draft_frontmatter.aliases = coerceArray(normalized.draft_frontmatter.aliases).filter((alias) => typeof alias === 'string')
  for (const key of requiredArrays) normalized[key] = coerceArray(source[key])
  return normalized
}

function validateExtractionShape(value) {
  const requiredArrays = ['claims', 'methods_used', 'datasets_used', 'concepts_touched', 'open_question_candidates', 'contradiction_signals']
  if (!value || typeof value !== 'object') throw new WikiExtractionValidationError('Extraction output must be an object')
  if (!value.draft_frontmatter || typeof value.draft_frontmatter !== 'object') throw new WikiExtractionValidationError('draft_frontmatter is required')
  if (typeof value.draft_body !== 'string') throw new WikiExtractionValidationError('draft_body must be a string')
  for (const key of requiredArrays) {
    if (!Array.isArray(value[key])) throw new WikiExtractionValidationError(`${key} must be an array`)
  }
  return true
}

export class PaperExtractor {
  constructor({ pdfTextExtractor, providerRouter, llmClient } = {}) {
    this.pdfTextExtractor = pdfTextExtractor || new PdfTextExtractor()
    this.providerRouter = providerRouter || new ProviderRouter()
    this.llmClient = llmClient || createDefaultWikiLLMClient()
  }

  async extractPaper(scholarlibDocId, library, adapter) {
    const doc = library.documents?.[scholarlibDocId]
    if (!doc) throw new Error(`Document not found: ${scholarlibDocId}`)
    if (!doc.box_path) throw new Error(`Document has no PDF path: ${scholarlibDocId}`)

    const schema = await WikiSchemaService.read(adapter)
    const pdf = await this.pdfTextExtractor.extractPdf(adapter, doc.box_path)
    const sensitivity = getDocumentSensitivity(doc)
    const pageText = this._fitContext(pdf.pages)

    let route = await this.providerRouter.route('extract_paper', {
      ...sensitivity,
      estimatedTokensIn: estimateTokens(pageText),
      estimatedTokensOut: 4000,
    })

    if (route.provider === 'ollama' && this.llmClient?.isAvailable) {
      const available = await this.llmClient.isAvailable(true)
      if (!available) {
        route = await this._fallbackRouteAfterLocalFailure({ sensitivity, pageText })
      }
    }

    const messages = this._buildPrompt({ schema, doc, pageText, pdf })
    let parsed
    let validationError = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.llmClient.chat(
        attempt === 0 ? messages : [...messages, { role: 'user', content: `Previous JSON failed validation: ${validationError.message}. Return corrected JSON only.` }],
        route.model,
        route.callOptions,
        route.provider
      )
      try {
        parsed = normalizeExtractionShape(parseModelJson(response), doc)
        validateExtractionShape(parsed)
        validationError = null
        break
      } catch (error) {
        validationError = error
      }
    }
    if (validationError) throw validationError

    parsed.draft_frontmatter = {
      ...parsed.draft_frontmatter,
      scholarlib_doc_id: scholarlibDocId,
      type: 'paper',
      sensitivity: sensitivity.sensitivity,
    }

    parsed.claims = await Promise.all(parsed.claims.map((claim) => this._normalizeClaim(claim, pdf, sensitivity.sensitivity)))
    parsed.extraction_metadata = {
      ...(parsed.extraction_metadata || {}),
      model: route.model,
      provider: route.provider,
      tokens_in: estimateTokens(pageText),
      tokens_out: parsed.extraction_metadata?.tokens_out || 0,
      extraction_version: pdf.extraction_version,
      extraction_confidence: pdf.extraction_confidence,
      ocr_warnings: pdf.ocr_warnings,
    }
    return parsed
  }

  async _fallbackRouteAfterLocalFailure({ sensitivity, pageText }) {
    const reason = this.llmClient.getLastError?.() || 'Ollama is unavailable'
    if (sensitivity.sensitivity === 'confidential') {
      throw {
        code: 'OLLAMA_UNAVAILABLE',
        message: `${reason}. This document is confidential, so ScholarLib will not fall back to a cloud provider.`,
      }
    }
    if (!sensitivity.allowedProviders.includes('claude')) {
      throw {
        code: 'OLLAMA_UNAVAILABLE',
        message: `${reason}. Cloud fallback is not allowed for this document namespace.`,
      }
    }
    if (!this.llmClient.isConfigured?.('claude')) {
      throw {
        code: 'WIKI_CLOUD_FALLBACK_NOT_CONFIGURED',
        message: `${reason}. Configure a Claude API key in Settings to let public wiki ingestion fall back when local Ollama is unavailable.`,
      }
    }
    return this.providerRouter.route('extract_paper', {
      ...sensitivity,
      forceCloudFallback: true,
      estimatedTokensIn: estimateTokens(pageText),
      estimatedTokensOut: 4000,
    })
  }

  _fitContext(pages) {
    const rendered = pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text}`).join('\n\n')
    if (estimateTokens(rendered) <= 24000) return rendered
    return pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text.slice(0, 6000)}`).join('\n\n')
  }

  _buildPrompt({ schema, doc, pageText, pdf }) {
    return [
      { role: 'system', content: 'You extract ScholarLib wiki paper proposals. Return only valid JSON. Do not include markdown fences, prose, comments, or trailing text.' },
      {
        role: 'user',
        content: [
          `Schema:\n${schema}`,
          `Return this exact JSON object shape:
{
  "draft_frontmatter": { "title": "...", "aliases": [], "doi": null },
  "draft_body": "markdown body using only ID wikilinks or no wikilinks",
  "claims": [
    { "claim_text": "...", "confidence": "low|medium|high", "supported_by": [
      { "pdf_page": 1, "char_start": 0, "char_end": 0, "quote_snippet": "..." }
    ] }
  ],
  "methods_used": [],
  "datasets_used": [],
  "concepts_touched": [],
  "open_question_candidates": [],
  "contradiction_signals": [],
  "extraction_metadata": { "tokens_out": 0 }
}`,
          `Metadata:\n${JSON.stringify(doc.metadata || {}, null, 2)}`,
          `Extraction confidence: ${pdf.extraction_confidence}`,
          `Paper text:\n${pageText}`,
        ].join('\n\n'),
      },
    ]
  }

  async _normalizeClaim(claim, pdf, sensitivity) {
    const supportedBy = await Promise.all((claim.supported_by || []).map(async (locator) => {
      const pageIndex = Math.max(0, (locator.pdf_page || locator.page_index + 1 || 1) - 1)
      const page = pdf.pages[pageIndex] || pdf.pages[0] || { text: '', page_text_hash: null }
      const charStart = Math.max(0, locator.char_start || 0)
      const charEnd = Math.min(page.text.length, locator.char_end || charStart + 280)
      const span = page.text.slice(charStart, charEnd)
      return {
        pdf_page: pageIndex + 1,
        char_start: charStart,
        char_end: charEnd,
        quote_snippet: sensitivity === 'confidential' ? null : (locator.quote_snippet || span).slice(0, 280),
        span_text_hash: locator.span_text_hash || await hashMarkdown(span),
        page_text_hash: locator.page_text_hash || page.page_text_hash,
      }
    }))
    return {
      ...claim,
      supported_by: supportedBy,
      confidence: claim.confidence || 'medium',
    }
  }
}

export { getDocumentSensitivity, validateExtractionShape }

function createDefaultWikiLLMClient() {
  return {
    chat(messages, model, callOptions, provider = 'ollama') {
      if (provider === 'claude') return claudeService.chat(messages, model, callOptions)
      if (provider === 'openai') return openaiService.chat(messages, model, callOptions)
      if (provider === 'gemini') return geminiService.chat(messages, model, callOptions)
      return ollamaService.chat(messages, model, callOptions)
    },
    isAvailable: (force) => ollamaService.isAvailable(force),
    getLastError: () => ollamaService.getLastError(),
    isConfigured(provider) {
      if (provider === 'claude') return claudeService.isConfigured()
      if (provider === 'openai') return openaiService.isConfigured()
      if (provider === 'gemini') return geminiService.isConfigured()
      if (provider === 'ollama') return true
      return false
    },
  }
}
