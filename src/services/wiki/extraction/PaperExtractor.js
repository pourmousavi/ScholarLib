import { ollamaService } from '../../ai/OllamaService'
import { ProviderRouter } from '../ProviderRouter'
import { WikiPaths } from '../WikiPaths'
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
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new WikiExtractionValidationError('Model did not return valid JSON')
  }
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
    this.llmClient = llmClient || {
      chat: (messages, model) => ollamaService.chat(messages, model),
    }
  }

  async extractPaper(scholarlibDocId, library, adapter) {
    const doc = library.documents?.[scholarlibDocId]
    if (!doc) throw new Error(`Document not found: ${scholarlibDocId}`)
    if (!doc.box_path) throw new Error(`Document has no PDF path: ${scholarlibDocId}`)

    const schema = await WikiSchemaService.read(adapter)
    const pdf = await this.pdfTextExtractor.extractPdf(adapter, doc.box_path)
    const sensitivity = getDocumentSensitivity(doc)
    const pageText = this._fitContext(pdf.pages)

    const route = await this.providerRouter.route('extract_paper', {
      ...sensitivity,
      estimatedTokensIn: estimateTokens(pageText),
      estimatedTokensOut: 4000,
    })

    const messages = this._buildPrompt({ schema, doc, pageText, pdf })
    let parsed
    let validationError = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.llmClient.chat(
        attempt === 0 ? messages : [...messages, { role: 'user', content: `Previous JSON failed validation: ${validationError.message}. Return corrected JSON only.` }],
        route.model,
        route.callOptions
      )
      parsed = parseModelJson(response)
      try {
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

  _fitContext(pages) {
    const rendered = pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text}`).join('\n\n')
    if (estimateTokens(rendered) <= 24000) return rendered
    return pages.map((page) => `PAGE ${page.index + 1} [${page.page_text_hash}]\n${page.text.slice(0, 6000)}`).join('\n\n')
  }

  _buildPrompt({ schema, doc, pageText, pdf }) {
    return [
      { role: 'system', content: 'You extract ScholarLib wiki paper proposals. Return strict JSON only.' },
      {
        role: 'user',
        content: [
          `Schema:\n${schema}`,
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
