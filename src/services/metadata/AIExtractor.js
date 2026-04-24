/**
 * AI-based metadata extraction
 * Used as fallback when GROBID, CrossRef and Semantic Scholar don't find a match
 * Requires AI service to be configured (Stage 09+)
 *
 * Enhanced with:
 * - Few-shot examples for better accuracy
 * - Chain-of-thought prompting
 * - Larger text window (6000 chars)
 * - Improved JSON parsing resilience
 */

const EXTRACTION_PROMPT = `You are an expert academic librarian extracting bibliographic metadata from academic papers.

Your task is to carefully analyze the paper excerpt and extract accurate metadata. Think step by step:

1. First, identify the title - it's usually the largest text at the top, before author names
2. Find author names - often listed after the title with affiliations below
3. Look for DOI patterns (10.XXXX/...) in headers or footers
4. Identify the journal/conference name from headers or footers
5. Find the publication year from headers, footers, or "Received/Accepted" dates
6. Extract the abstract if present (usually labeled "Abstract")

EXAMPLES:

Input: "Attention Is All You Need
Ashish Vaswani* Google Brain
Noam Shazeer* Google Brain
Niki Parmar* Google Research
Jakob Uszkoreit* Google Research
..."
Output: {"title": "Attention Is All You Need", "authors": [{"last": "Vaswani", "first": "Ashish"}, {"last": "Shazeer", "first": "Noam"}, {"last": "Parmar", "first": "Niki"}, {"last": "Uszkoreit", "first": "Jakob"}], "year": 2017, "journal": "Advances in Neural Information Processing Systems", "volume": "30", "pages": "", "doi": "", "abstract": "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...", "keywords": ["transformer", "attention", "neural machine translation"]}

Input: "Deep Residual Learning for Image Recognition
Kaiming He Xiangyu Zhang Shaoqing Ren Jian Sun
Microsoft Research
{kahe, v-xiazha, v-shMDren, jiansun}@microsoft.com
Abstract
Deeper neural networks are more difficult to train..."
Output: {"title": "Deep Residual Learning for Image Recognition", "authors": [{"last": "He", "first": "Kaiming"}, {"last": "Zhang", "first": "Xiangyu"}, {"last": "Ren", "first": "Shaoqing"}, {"last": "Sun", "first": "Jian"}], "year": 2016, "journal": "IEEE Conference on Computer Vision and Pattern Recognition", "volume": "", "pages": "770-778", "doi": "10.1109/CVPR.2016.90", "abstract": "Deeper neural networks are more difficult to train...", "keywords": ["deep learning", "residual learning", "image recognition"]}

Input: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding
Jacob Devlin Ming-Wei Chang Kenton Lee Kristina Toutanova
Google AI Language
{jacobdevlin,mingweichang,kentonl,kristout}@google.com
Abstract
We introduce a new language representation model called BERT..."
Output: {"title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", "authors": [{"last": "Devlin", "first": "Jacob"}, {"last": "Chang", "first": "Ming-Wei"}, {"last": "Lee", "first": "Kenton"}, {"last": "Toutanova", "first": "Kristina"}], "year": 2019, "journal": "Proceedings of NAACL-HLT", "volume": "", "pages": "", "doi": "", "abstract": "We introduce a new language representation model called BERT...", "keywords": ["BERT", "language model", "pre-training", "NLP"]}

Now extract metadata from this paper. Return ONLY a valid JSON object with these fields (no markdown code blocks, no explanation):
{
  "title": "full paper title",
  "authors": [{"last": "surname", "first": "given name or initials"}],
  "year": 2024,
  "journal": "journal or conference name",
  "volume": "volume number or empty string",
  "pages": "page range or empty string",
  "doi": "DOI if found or empty string",
  "abstract": "first 2-3 sentences of abstract",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

IMPORTANT — keywords rule: only populate "keywords" with terms copied verbatim from an explicit "Keywords:", "Key words:", or "Index Terms:" section in the paper. Do NOT invent, infer, or summarize keywords from the title or abstract. If no such section is present in the text, return an empty array: "keywords": []. Return at most 6 keywords.

Paper text:
`

export const AIExtractor = {
  async extract(firstPagesText, aiService) {
    if (!aiService) {
      return this.createEmptyResult('AI service not available')
    }

    try {
      // Use larger text window for better context
      const textToAnalyze = firstPagesText.slice(0, 6000)
      const prompt = EXTRACTION_PROMPT + textToAnalyze

      console.log('AIExtractor: Sending text to AI service (' + textToAnalyze.length + ' chars)')

      const response = await aiService.chat([
        { role: 'user', content: prompt }
      ])

      const parsed = this.parseJSON(response)
      if (!parsed) {
        console.warn('AIExtractor: Failed to parse AI response')
        console.log('AIExtractor: Raw response:', response?.slice(0, 500))
        return this.createEmptyResult('Failed to parse AI response')
      }

      return this.normalize(parsed)
    } catch (error) {
      console.error('AI extraction failed:', error)
      return this.createEmptyResult(error.message)
    }
  },

  parseJSON(text) {
    if (!text) return null

    // Strategy 1: Try to find JSON object in response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (e) {
        // Continue to other strategies
      }
    }

    // Strategy 2: Try to extract from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim())
      } catch (e) {
        // Continue
      }
    }

    // Strategy 3: Try to fix common JSON issues
    const fixedText = this.fixCommonJSONIssues(text)
    if (fixedText) {
      try {
        return JSON.parse(fixedText)
      } catch (e) {
        // Continue
      }
    }

    // Strategy 4: Try line-by-line extraction for heavily broken JSON
    return this.extractFieldsManually(text)
  },

  fixCommonJSONIssues(text) {
    // Find JSON-like content
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null

    let json = match[0]

    // Fix trailing commas before closing brackets
    json = json.replace(/,\s*([}\]])/g, '$1')

    // Fix missing quotes around values
    json = json.replace(/:(\s*)([^",\[\]{}]+)(\s*[,}])/g, (match, space1, value, ending) => {
      value = value.trim()
      // Don't quote numbers, booleans, null
      if (/^-?\d+\.?\d*$/.test(value) ||
          value === 'true' || value === 'false' || value === 'null') {
        return `:${space1}${value}${ending}`
      }
      return `:${space1}"${value}"${ending}`
    })

    // Fix unescaped quotes in strings
    json = json.replace(/"([^"]*)":\s*"([^"]*)"/g, (match, key, value) => {
      const escapedValue = value.replace(/(?<!\\)"/g, '\\"')
      return `"${key}": "${escapedValue}"`
    })

    return json
  },

  extractFieldsManually(text) {
    // Last resort: try to extract fields individually
    const result = {}

    // Extract title
    const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/i)
    if (titleMatch) result.title = titleMatch[1]

    // Extract year
    const yearMatch = text.match(/"year"\s*:\s*(\d{4})/i)
    if (yearMatch) result.year = parseInt(yearMatch[1], 10)

    // Extract journal
    const journalMatch = text.match(/"journal"\s*:\s*"([^"]+)"/i)
    if (journalMatch) result.journal = journalMatch[1]

    // Extract DOI
    const doiMatch = text.match(/"doi"\s*:\s*"(10\.[^"]+)"/i)
    if (doiMatch) result.doi = doiMatch[1]

    // Extract authors (simplified)
    const authorsMatch = text.match(/"authors"\s*:\s*\[([\s\S]*?)\]/i)
    if (authorsMatch) {
      const authorMatches = authorsMatch[1].matchAll(/"last"\s*:\s*"([^"]+)"[^}]*"first"\s*:\s*"([^"]*)"/gi)
      result.authors = Array.from(authorMatches).map(m => ({
        last: m[1],
        first: m[2] || ''
      }))
    }

    // Extract abstract
    const abstractMatch = text.match(/"abstract"\s*:\s*"([^"]+)"/i)
    if (abstractMatch) result.abstract = abstractMatch[1]

    // Extract keywords
    const keywordsMatch = text.match(/"keywords"\s*:\s*\[([\s\S]*?)\]/i)
    if (keywordsMatch) {
      const kwMatches = keywordsMatch[1].matchAll(/"([^"]+)"/g)
      result.keywords = Array.from(kwMatches).map(m => m[1]).slice(0, 6)
    }

    return Object.keys(result).length > 0 ? result : null
  },

  normalize(data) {
    // Normalize authors array
    const authors = (data.authors || []).map(a => {
      // Handle various author formats
      if (typeof a === 'string') {
        const parts = a.split(' ')
        return {
          last: parts.pop() || '',
          first: parts.join(' '),
          orcid: null
        }
      }
      return {
        last: a.last || a.family || a.surname || '',
        first: a.first || a.given || a.forename || '',
        orcid: a.orcid || null
      }
    })

    // Normalize year
    let year = data.year
    if (typeof year === 'string') {
      year = parseInt(year, 10)
    }
    if (year && (year < 1900 || year > 2100)) {
      year = null
    }

    // Clean DOI
    let doi = data.doi || ''
    if (doi) {
      doi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim()
      // Validate DOI format
      if (!doi.startsWith('10.')) {
        doi = ''
      }
    }

    // Calculate confidence based on extracted fields
    const confidence = {
      title: data.title?.length > 10 ? 80 : (data.title ? 60 : 0),
      authors: authors.length > 0 ? 75 : 0,
      journal: data.journal?.length > 3 ? 70 : 0,
      doi: doi ? 85 : 0,
      year: year ? 80 : 0,
      abstract: data.abstract?.length > 50 ? 75 : (data.abstract ? 60 : 0)
    }

    return {
      title: data.title || '',
      authors,
      year: year || null,
      journal: data.journal || '',
      volume: data.volume || '',
      issue: data.issue || '',
      pages: data.pages || '',
      doi,
      abstract: data.abstract || '',
      keywords: Array.isArray(data.keywords) ? data.keywords.slice(0, 6) : [],
      type: 'journal-article',
      url: doi ? `https://doi.org/${doi}` : '',
      extraction_source: 'ai',
      extraction_confidence: confidence
    }
  },

  createEmptyResult(error) {
    return {
      title: '',
      authors: [],
      year: null,
      journal: '',
      volume: '',
      issue: '',
      pages: '',
      doi: '',
      abstract: '',
      keywords: [],
      type: 'journal-article',
      url: '',
      extraction_source: 'manual',
      extraction_confidence: {
        title: 0,
        authors: 0,
        journal: 0,
        doi: 0,
        year: 0,
        abstract: 0
      },
      extraction_error: error
    }
  }
}
