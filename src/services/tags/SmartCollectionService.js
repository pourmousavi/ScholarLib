import { nanoid } from 'nanoid'

class SmartCollectionService {
  /**
   * Create a new smart collection
   */
  create(name, filter, icon = 'bookmark') {
    return {
      id: `sc_${nanoid()}`,
      name,
      icon,
      filter: {
        tags: filter.tags || [],
        tagMode: filter.tagMode || 'AND',
        starred: filter.starred ?? null,
        read: filter.read ?? null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  /**
   * Evaluate which documents match a collection's filter
   */
  evaluate(collection, documents) {
    return Object.entries(documents)
      .filter(([id, doc]) => this.matchesFilter(doc, collection.filter))
      .map(([id]) => id)
  }

  /**
   * Check if a single document matches a filter
   */
  matchesFilter(doc, filter) {
    const { tags, tagMode, starred, read } = filter
    const docTags = doc.user_data?.tags || []

    // Tag matching
    let tagMatch = true
    if (tags && tags.length > 0) {
      tagMatch = tagMode === 'AND'
        ? tags.every(t => docTags.includes(t))
        : tags.some(t => docTags.includes(t))
    }

    // Additional filters
    const starredMatch = starred === null || starred === undefined || doc.user_data?.starred === starred
    const readMatch = read === null || read === undefined || doc.user_data?.read === read

    return tagMatch && starredMatch && readMatch
  }

  /**
   * Update a collection
   */
  update(collection, updates) {
    return {
      ...collection,
      ...updates,
      updated_at: new Date().toISOString(),
    }
  }
}

export const smartCollectionService = new SmartCollectionService()
