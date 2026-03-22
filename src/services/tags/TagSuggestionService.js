import { tagService } from './TagService'

class TagSuggestionService {
  /**
   * Suggest tags for a document based on its content
   * Uses existing tags as candidates and AI to match
   */
  async suggestTags(documentText, existingTags, aiService, limit = 5) {
    if (Object.keys(existingTags).length === 0) {
      return []
    }

    const tagList = Object.entries(existingTags)
      .map(([slug, tag]) => `- ${tag.displayName}${tag.description ? `: ${tag.description}` : ''}`)
      .join('\n')

    const prompt = `Given this academic document text and a list of existing tags, suggest which tags are most relevant.

Document excerpt (first 2000 chars):
${documentText.slice(0, 2000)}

Available tags:
${tagList}

Return ONLY a JSON array of tag names that match, ordered by relevance. Example: ["Battery Thermal Management", "Degradation"]
Return at most ${limit} tags. If no tags match well, return an empty array [].`

    try {
      const response = await aiService.complete(prompt, { maxTokens: 200 })

      // Parse JSON response
      const match = response.match(/\[[\s\S]*\]/)
      if (!match) return []

      const suggestedNames = JSON.parse(match[0])

      // Convert display names back to slugs
      return suggestedNames
        .map(name => {
          const entry = Object.entries(existingTags).find(
            ([slug, tag]) => tag.displayName.toLowerCase() === name.toLowerCase()
          )
          return entry ? entry[0] : null
        })
        .filter(Boolean)
        .slice(0, limit)
    } catch (e) {
      console.error('Tag suggestion failed:', e)
      return []
    }
  }

  /**
   * Simple keyword-based suggestion (no AI required)
   * Falls back to this if AI is unavailable
   */
  suggestTagsByKeywords(documentText, existingTags, limit = 5) {
    const text = documentText.toLowerCase()
    const scores = {}

    for (const [slug, tag] of Object.entries(existingTags)) {
      // Check if tag name appears in text
      const nameWords = tag.displayName.toLowerCase().split(/\s+/)
      let score = 0

      for (const word of nameWords) {
        if (word.length > 3 && text.includes(word)) {
          score += 1
        }
      }

      // Check description words too
      if (tag.description) {
        const descWords = tag.description.toLowerCase().split(/\s+/)
        for (const word of descWords) {
          if (word.length > 4 && text.includes(word)) {
            score += 0.5
          }
        }
      }

      if (score > 0) {
        scores[slug] = score
      }
    }

    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([slug]) => slug)
  }
}

export const tagSuggestionService = new TagSuggestionService()
