/**
 * CollectionService - Manages collection registry
 *
 * Collections are logical groupings of tags that enable better organization,
 * filtering, and sharing of related documents.
 *
 * Collections are stored with:
 * - slug: lowercase-hyphenated key (e.g., "thesis-ch3")
 * - displayName: original user input for display (e.g., "Thesis Chapter 3")
 * - description: optional description of the collection's purpose
 * - color: hex color for visual distinction (from collection palette)
 * - tags: array of tag slugs belonging to this collection
 * - shared_with: sharing configuration (same structure as folders)
 */

const COLLECTION_COLORS = [
  '#7C3AED', // Violet
  '#0EA5E9', // Sky
  '#10B981', // Emerald
  '#F97316', // Orange
  '#EC4899', // Pink
  '#6366F1', // Indigo
  '#84CC16', // Lime
  '#14B8A6', // Teal
]

class CollectionService {
  colorIndex = 0

  /**
   * Convert displayName to slug
   * "Thesis Chapter 3" → "thesis-chapter-3"
   */
  slugify(displayName) {
    if (!displayName || typeof displayName !== 'string') return ''

    return displayName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')           // spaces to hyphens
      .replace(/[^a-z0-9-]/g, '')     // remove special chars
      .replace(/-+/g, '-')            // collapse multiple hyphens
      .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
  }

  /**
   * Get next color from palette (rotating)
   */
  getNextColor(existingCollections = {}) {
    const usedColors = Object.values(existingCollections).map(c => c.color)
    // Find first unused color, or cycle through
    for (const color of COLLECTION_COLORS) {
      if (!usedColors.includes(color)) return color
    }
    // All colors used, rotate
    return COLLECTION_COLORS[this.colorIndex++ % COLLECTION_COLORS.length]
  }

  /**
   * Create a new collection in the registry
   * Returns { slug, collection } or { error } if slug already exists
   */
  createCollection(collectionRegistry, displayName, options = {}) {
    const slug = this.slugify(displayName)

    if (!slug) {
      return { error: 'Invalid collection name' }
    }

    if (collectionRegistry[slug]) {
      return { error: 'Collection already exists', existingSlug: slug }
    }

    const now = new Date().toISOString()
    const collection = {
      displayName: displayName.trim(),
      description: options.description || '',
      color: options.color || this.getNextColor(collectionRegistry),
      tags: options.tags || [],
      included_docs: [],
      excluded_docs: [],
      shared_with: [],
      created_at: now,
      updated_at: now
    }

    return { slug, collection }
  }

  /**
   * Get collection by slug, returns null if not found
   */
  getCollection(collectionRegistry, slug) {
    return collectionRegistry[slug] || null
  }

  /**
   * Get all collections with computed document counts
   * Document count = unique documents that are explicitly included OR have ANY tag in the collection (excluding excluded_docs)
   */
  getAllCollectionsWithCounts(collectionRegistry = {}, tagRegistry = {}, documents = {}) {
    return Object.entries(collectionRegistry).map(([slug, collection]) => {
      // Count documents that match this collection (hybrid logic)
      let documentCount = 0
      const includedDocs = collection.included_docs || []
      const excludedDocs = collection.excluded_docs || []

      for (const doc of Object.values(documents)) {
        // Excluded docs never count
        if (excludedDocs.includes(doc.id)) continue
        // Explicitly included docs always count
        if (includedDocs.includes(doc.id)) {
          documentCount++
          continue
        }
        // Tag-based membership
        const docTags = doc.user_data?.tags || []
        if (collection.tags.some(t => docTags.includes(t))) {
          documentCount++
        }
      }

      return {
        slug,
        ...collection,
        documentCount,
        tagCount: collection.tags.length,
        includedCount: includedDocs.length,
        excludedCount: excludedDocs.length
      }
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * Update collection metadata
   * If displayName changes, slug may need to change too
   */
  updateCollection(collectionRegistry, slug, updates) {
    if (!collectionRegistry[slug]) {
      return { error: 'Collection not found' }
    }

    const collection = { ...collectionRegistry[slug] }
    let newSlug = slug

    // Handle displayName change → potential slug change
    if (updates.displayName && updates.displayName !== collection.displayName) {
      newSlug = this.slugify(updates.displayName)

      // Check if new slug conflicts with existing (and is different)
      if (newSlug !== slug && collectionRegistry[newSlug]) {
        return { error: 'A collection with this name already exists' }
      }

      collection.displayName = updates.displayName.trim()
    }

    // Update other fields
    if (updates.color !== undefined) collection.color = updates.color
    if (updates.description !== undefined) collection.description = updates.description
    if (updates.tags !== undefined) collection.tags = [...updates.tags]
    if (updates.shared_with !== undefined) collection.shared_with = updates.shared_with
    if (updates.included_docs !== undefined) collection.included_docs = [...updates.included_docs]
    if (updates.excluded_docs !== undefined) collection.excluded_docs = [...updates.excluded_docs]
    collection.updated_at = new Date().toISOString()

    return {
      oldSlug: slug,
      newSlug,
      collection,
      slugChanged: newSlug !== slug
    }
  }

  /**
   * Delete collection from registry
   * Tags remain unchanged (collections don't own tags)
   */
  deleteCollection(collectionRegistry, slug) {
    if (!collectionRegistry[slug]) {
      return { error: 'Collection not found' }
    }

    return { slug, success: true }
  }

  /**
   * Merge multiple source collections into a target collection
   * Target gets all tags and excluded_docs from sources (deduplicated)
   */
  mergeCollections(collectionRegistry, sourceSlugs, targetSlug) {
    // Validate target exists
    if (!collectionRegistry[targetSlug]) {
      return { error: 'Target collection not found' }
    }

    // Validate all sources exist
    for (const slug of sourceSlugs) {
      if (!collectionRegistry[slug]) {
        return { error: `Source collection "${slug}" not found` }
      }
      if (slug === targetSlug) {
        return { error: 'Cannot merge a collection into itself' }
      }
    }

    // Collect all tags from sources
    const allTags = new Set(collectionRegistry[targetSlug].tags)
    for (const slug of sourceSlugs) {
      for (const tag of collectionRegistry[slug].tags) {
        allTags.add(tag)
      }
    }

    // Collect all included_docs from sources
    const allIncluded = new Set(collectionRegistry[targetSlug].included_docs || [])
    for (const slug of sourceSlugs) {
      for (const docId of collectionRegistry[slug].included_docs || []) {
        allIncluded.add(docId)
      }
    }

    // Collect all excluded_docs from sources
    const allExcluded = new Set(collectionRegistry[targetSlug].excluded_docs || [])
    for (const slug of sourceSlugs) {
      for (const docId of collectionRegistry[slug].excluded_docs || []) {
        allExcluded.add(docId)
      }
    }

    return {
      targetSlug,
      mergedTags: [...allTags],
      mergedIncludedDocs: [...allIncluded],
      mergedExcludedDocs: [...allExcluded],
      collectionsToDelete: [...sourceSlugs]
    }
  }

  /**
   * Add a tag to a collection
   */
  addTagToCollection(collectionRegistry, collectionSlug, tagSlug) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    if (collection.tags.includes(tagSlug)) {
      return { error: 'Tag already in collection' }
    }

    return {
      collectionSlug,
      newTags: [...collection.tags, tagSlug]
    }
  }

  /**
   * Remove a tag from a collection
   */
  removeTagFromCollection(collectionRegistry, collectionSlug, tagSlug) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    if (!collection.tags.includes(tagSlug)) {
      return { error: 'Tag not in collection' }
    }

    return {
      collectionSlug,
      newTags: collection.tags.filter(t => t !== tagSlug)
    }
  }

  /**
   * Remove a tag from ALL collections (called when a tag is deleted)
   */
  removeTagFromAllCollections(collectionRegistry, tagSlug) {
    const updates = []

    for (const [collectionSlug, collection] of Object.entries(collectionRegistry)) {
      if (collection.tags.includes(tagSlug)) {
        updates.push({
          collectionSlug,
          newTags: collection.tags.filter(t => t !== tagSlug)
        })
      }
    }

    return updates
  }

  /**
   * Get all collections that contain a specific tag
   */
  getCollectionsForTag(collectionRegistry, tagSlug) {
    return Object.entries(collectionRegistry)
      .filter(([_, collection]) => collection.tags.includes(tagSlug))
      .map(([slug, collection]) => ({ slug, ...collection }))
  }

  /**
   * Get all collections that a document belongs to
   * (based on explicit inclusion, tags, respecting exclusions)
   */
  getCollectionsForDocument(collectionRegistry, document) {
    const docTags = document.user_data?.tags || []

    return Object.entries(collectionRegistry)
      .filter(([_, collection]) => {
        // Check if explicitly excluded (highest priority)
        if ((collection.excluded_docs || []).includes(document.id)) {
          return false
        }
        // Check if explicitly included
        if ((collection.included_docs || []).includes(document.id)) {
          return true
        }
        // Check if has any matching tag
        return collection.tags.some(t => docTags.includes(t))
      })
      .map(([slug, collection]) => ({
        slug,
        ...collection,
        // Add membership reason for UI clarity
        membershipReason: (collection.included_docs || []).includes(document.id)
          ? 'included'
          : 'tags'
      }))
  }

  /**
   * Check if a document matches a collection filter (hybrid approach)
   * Returns true if document is explicitly included OR has ANY tag from the collection,
   * and is not explicitly excluded
   */
  documentMatchesCollection(document, collection) {
    // Check if explicitly excluded (highest priority)
    if ((collection.excluded_docs || []).includes(document.id)) {
      return false
    }
    // Check if explicitly included
    if ((collection.included_docs || []).includes(document.id)) {
      return true
    }
    // Check tag-based membership
    const docTags = document.user_data?.tags || []
    return collection.tags.some(t => docTags.includes(t))
  }

  /**
   * Check if a document matches multiple collections (hybrid approach)
   * @param mode 'OR' - matches any collection, 'AND' - matches ALL collections
   */
  documentMatchesCollections(document, collections, mode = 'OR') {
    const docTags = document.user_data?.tags || []

    // Check if excluded from ANY selected collection
    const isExcluded = collections.some(c =>
      (c.excluded_docs || []).includes(document.id)
    )
    if (isExcluded) return false

    // Helper to check if doc matches a single collection
    const matchesSingle = (collection) => {
      // Explicitly included
      if ((collection.included_docs || []).includes(document.id)) {
        return true
      }
      // Tag-based match
      return collection.tags.some(t => docTags.includes(t))
    }

    if (mode === 'OR') {
      // Matches any collection
      return collections.some(matchesSingle)
    } else {
      // Matches ALL collections
      return collections.every(matchesSingle)
    }
  }

  /**
   * Add a document to a collection explicitly (regardless of tags)
   * Document will appear in collection without needing matching tags
   */
  addDocumentToCollection(collectionRegistry, collectionSlug, docId) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    const includedDocs = collection.included_docs || []
    const excludedDocs = collection.excluded_docs || []

    // If document was excluded, remove from exclusion list
    const newExcludedDocs = excludedDocs.filter(id => id !== docId)

    // Add to included if not already there
    if (includedDocs.includes(docId)) {
      // Already included, but may need to remove from excluded
      if (newExcludedDocs.length !== excludedDocs.length) {
        return {
          collectionSlug,
          newIncludedDocs: includedDocs,
          newExcludedDocs
        }
      }
      return { error: 'Document already in collection' }
    }

    return {
      collectionSlug,
      newIncludedDocs: [...includedDocs, docId],
      newExcludedDocs
    }
  }

  /**
   * Exclude a document from a collection
   * Document will not appear in collection even if it has matching tags
   */
  excludeDocumentFromCollection(collectionRegistry, collectionSlug, docId) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    const includedDocs = collection.included_docs || []
    const excludedDocs = collection.excluded_docs || []

    // Remove from included list if present
    const newIncludedDocs = includedDocs.filter(id => id !== docId)

    if (excludedDocs.includes(docId)) {
      return { error: 'Document already excluded from collection' }
    }

    return {
      collectionSlug,
      newIncludedDocs,
      newExcludedDocs: [...excludedDocs, docId]
    }
  }

  /**
   * Re-include a document in a collection (remove from exclusion list)
   * Document will appear in collection again if it has matching tags or was explicitly included
   */
  reincludeDocumentInCollection(collectionRegistry, collectionSlug, docId) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    const excludedDocs = collection.excluded_docs || []

    if (!excludedDocs.includes(docId)) {
      return { error: 'Document is not excluded from collection' }
    }

    return {
      collectionSlug,
      newExcludedDocs: excludedDocs.filter(id => id !== docId)
    }
  }

  /**
   * Remove a document from a collection
   * If document was explicitly included, removes from included_docs
   * If document was in collection via tags, adds to excluded_docs
   */
  removeDocumentFromCollection(collectionRegistry, collectionSlug, docId) {
    if (!collectionRegistry[collectionSlug]) {
      return { error: 'Collection not found' }
    }

    const collection = collectionRegistry[collectionSlug]
    const includedDocs = collection.included_docs || []
    const excludedDocs = collection.excluded_docs || []

    // Check if document is explicitly included
    if (includedDocs.includes(docId)) {
      // Just remove from included_docs (don't add to excluded)
      return {
        collectionSlug,
        newIncludedDocs: includedDocs.filter(id => id !== docId),
        newExcludedDocs: excludedDocs,
        wasExplicitlyIncluded: true
      }
    }

    // Document is in collection via tags, add to excluded_docs
    if (excludedDocs.includes(docId)) {
      return { error: 'Document already removed from collection' }
    }

    return {
      collectionSlug,
      newIncludedDocs: includedDocs,
      newExcludedDocs: [...excludedDocs, docId],
      wasExplicitlyIncluded: false
    }
  }

  /**
   * Check if a document is excluded from a specific collection
   */
  isDocumentExcluded(collectionRegistry, collectionSlug, docId) {
    const collection = collectionRegistry[collectionSlug]
    if (!collection) return false
    return (collection.excluded_docs || []).includes(docId)
  }

  /**
   * Check if a document is explicitly included in a specific collection
   */
  isDocumentExplicitlyIncluded(collectionRegistry, collectionSlug, docId) {
    const collection = collectionRegistry[collectionSlug]
    if (!collection) return false
    return (collection.included_docs || []).includes(docId)
  }

  /**
   * Search collections by query (for autocomplete)
   */
  searchCollections(collectionRegistry, query) {
    if (!query || typeof query !== 'string') return []

    const q = query.toLowerCase().trim()
    if (!q) return []

    return Object.entries(collectionRegistry)
      .filter(([slug, collection]) =>
        slug.includes(q) ||
        collection.displayName.toLowerCase().includes(q)
      )
      .map(([slug, collection]) => ({ slug, ...collection }))
      .slice(0, 10) // Limit autocomplete results
  }
}

export const collectionService = new CollectionService()
export { COLLECTION_COLORS }
