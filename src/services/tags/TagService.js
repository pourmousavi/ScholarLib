/**
 * TagService - Manages global tag registry with metadata
 *
 * Tags are stored with:
 * - slug: lowercase-hyphenated key (e.g., "battery-thermal-management")
 * - displayName: original user input for display (e.g., "Battery Thermal Management")
 * - color: hex color for visual distinction
 * - category: optional grouping
 * - description: optional description
 */

const TAG_COLORS = [
  '#4A90D9', // Blue
  '#E85D75', // Rose
  '#50C878', // Emerald
  '#9B59B6', // Purple
  '#F39C12', // Amber
  '#1ABC9C', // Teal
  '#E67E22', // Orange
  '#3498DB', // Sky
]

class TagService {
  colorIndex = 0

  /**
   * Convert displayName to slug
   * "Battery Thermal Management" → "battery-thermal-management"
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
  getNextColor(existingTags = {}) {
    const usedColors = Object.values(existingTags).map(t => t.color)
    // Find first unused color, or cycle through
    for (const color of TAG_COLORS) {
      if (!usedColors.includes(color)) return color
    }
    // All colors used, rotate
    return TAG_COLORS[this.colorIndex++ % TAG_COLORS.length]
  }

  /**
   * Create a new tag in the registry
   * Returns { slug, tag } or { error } if slug already exists
   */
  createTag(tagRegistry, displayName, options = {}) {
    const slug = this.slugify(displayName)

    if (!slug) {
      return { error: 'Invalid tag name' }
    }

    if (tagRegistry[slug]) {
      return { error: 'Tag already exists', existingSlug: slug }
    }

    const now = new Date().toISOString()
    const tag = {
      displayName: displayName.trim(),
      color: options.color || this.getNextColor(tagRegistry),
      category: options.category || null,
      description: options.description || '',
      created_at: now,
      updated_at: now
    }

    return { slug, tag }
  }

  /**
   * Get tag by slug, returns null if not found
   */
  getTag(tagRegistry, slug) {
    return tagRegistry[slug] || null
  }

  /**
   * Get all tags with document counts
   */
  getAllTagsWithCounts(tagRegistry = {}, documents = {}) {
    const counts = {}

    // Initialize counts for all tags
    for (const slug of Object.keys(tagRegistry)) {
      counts[slug] = 0
    }

    // Count documents per tag
    for (const doc of Object.values(documents)) {
      const tags = doc.user_data?.tags || []
      for (const slug of tags) {
        if (counts[slug] !== undefined) {
          counts[slug]++
        }
      }
    }

    return Object.entries(tagRegistry).map(([slug, tag]) => ({
      slug,
      ...tag,
      documentCount: counts[slug] || 0
    })).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  /**
   * Update tag metadata (color, category, description, displayName)
   * If displayName changes, slug may need to change too
   */
  updateTag(tagRegistry, documents, notes, slug, updates) {
    if (!tagRegistry[slug]) {
      return { error: 'Tag not found' }
    }

    const tag = { ...tagRegistry[slug] }
    let newSlug = slug

    // Handle displayName change → potential slug change
    if (updates.displayName && updates.displayName !== tag.displayName) {
      newSlug = this.slugify(updates.displayName)

      // Check if new slug conflicts with existing (and is different)
      if (newSlug !== slug && tagRegistry[newSlug]) {
        return { error: 'A tag with this name already exists' }
      }

      tag.displayName = updates.displayName.trim()
    }

    // Update other fields
    if (updates.color !== undefined) tag.color = updates.color
    if (updates.category !== undefined) tag.category = updates.category
    if (updates.description !== undefined) tag.description = updates.description
    if (updates.shared_with !== undefined) tag.shared_with = updates.shared_with
    tag.updated_at = new Date().toISOString()

    // If slug changed, need to update all document and note references
    const docUpdates = []
    const noteUpdates = []

    if (newSlug !== slug) {
      // Update documents
      for (const [docId, doc] of Object.entries(documents)) {
        const tags = doc.user_data?.tags || []
        if (tags.includes(slug)) {
          docUpdates.push({
            docId,
            newTags: tags.map(t => t === slug ? newSlug : t)
          })
        }
      }

      // Update notes
      for (const [docId, note] of Object.entries(notes || {})) {
        const tags = note.tags || []
        if (tags.includes(slug)) {
          noteUpdates.push({
            docId,
            newTags: tags.map(t => t === slug ? newSlug : t)
          })
        }
      }
    }

    return {
      oldSlug: slug,
      newSlug,
      tag,
      docUpdates,
      noteUpdates,
      slugChanged: newSlug !== slug
    }
  }

  /**
   * Delete tag from registry and ALL document/note references
   * Returns list of affected document and note IDs
   */
  deleteTag(tagRegistry, documents, notes, slug) {
    if (!tagRegistry[slug]) {
      return { error: 'Tag not found' }
    }

    const affectedDocs = []
    const affectedNotes = []

    // Find all documents with this tag
    for (const [docId, doc] of Object.entries(documents)) {
      const tags = doc.user_data?.tags || []
      if (tags.includes(slug)) {
        affectedDocs.push({
          docId,
          newTags: tags.filter(t => t !== slug)
        })
      }
    }

    // Find all notes with this tag
    for (const [docId, note] of Object.entries(notes || {})) {
      const tags = note.tags || []
      if (tags.includes(slug)) {
        affectedNotes.push({
          docId,
          newTags: tags.filter(t => t !== slug)
        })
      }
    }

    return {
      slug,
      affectedDocs,
      affectedNotes,
      totalAffected: affectedDocs.length + affectedNotes.length
    }
  }

  /**
   * Merge multiple source tags into a target tag
   * All documents/notes with source tags get the target tag instead
   */
  mergeTags(tagRegistry, documents, notes, sourceSlugs, targetSlug) {
    // Validate target exists
    if (!tagRegistry[targetSlug]) {
      return { error: 'Target tag not found' }
    }

    // Validate all sources exist
    for (const slug of sourceSlugs) {
      if (!tagRegistry[slug]) {
        return { error: `Source tag "${slug}" not found` }
      }
      if (slug === targetSlug) {
        return { error: 'Cannot merge a tag into itself' }
      }
    }

    const docUpdates = []
    const noteUpdates = []
    const tagsToDelete = [...sourceSlugs]

    // Update documents
    for (const [docId, doc] of Object.entries(documents)) {
      const tags = doc.user_data?.tags || []
      const hasSource = sourceSlugs.some(s => tags.includes(s))

      if (hasSource) {
        // Remove source tags, ensure target is present, dedupe
        let newTags = tags.filter(t => !sourceSlugs.includes(t))
        if (!newTags.includes(targetSlug)) {
          newTags.push(targetSlug)
        }
        docUpdates.push({ docId, newTags })
      }
    }

    // Update notes
    for (const [docId, note] of Object.entries(notes || {})) {
      const tags = note.tags || []
      const hasSource = sourceSlugs.some(s => tags.includes(s))

      if (hasSource) {
        let newTags = tags.filter(t => !sourceSlugs.includes(t))
        if (!newTags.includes(targetSlug)) {
          newTags.push(targetSlug)
        }
        noteUpdates.push({ docId, newTags })
      }
    }

    return {
      targetSlug,
      tagsToDelete,
      docUpdates,
      noteUpdates
    }
  }

  /**
   * Add a tag to multiple documents at once
   */
  addTagToDocuments(documents, slug, docIds) {
    const updates = []

    for (const docId of docIds) {
      const doc = documents[docId]
      if (!doc) continue

      const tags = doc.user_data?.tags || []
      if (!tags.includes(slug)) {
        updates.push({
          docId,
          newTags: [...tags, slug]
        })
      }
    }

    return updates
  }

  /**
   * Remove a tag from multiple documents at once
   */
  removeTagFromDocuments(documents, slug, docIds) {
    const updates = []

    for (const docId of docIds) {
      const doc = documents[docId]
      if (!doc) continue

      const tags = doc.user_data?.tags || []
      if (tags.includes(slug)) {
        updates.push({
          docId,
          newTags: tags.filter(t => t !== slug)
        })
      }
    }

    return updates
  }

  /**
   * Sync orphan tags from documents into the registry
   * Finds tags used in documents that don't exist in registry and creates them
   * Returns { syncedTags: [{slug, tag}], registry: updatedRegistry }
   */
  syncOrphanTags(tagRegistry, documents) {
    const orphanSlugs = new Set()

    // Find all tags used in documents
    for (const doc of Object.values(documents)) {
      const tags = doc.user_data?.tags || []
      for (const slug of tags) {
        if (slug && !tagRegistry[slug]) {
          orphanSlugs.add(slug)
        }
      }
    }

    if (orphanSlugs.size === 0) {
      return { syncedTags: [], registry: tagRegistry }
    }

    // Create registry entries for orphan tags
    const syncedTags = []
    const updatedRegistry = { ...tagRegistry }

    for (const slug of orphanSlugs) {
      // Convert slug back to display name (capitalize words)
      const displayName = slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      const now = new Date().toISOString()
      const tag = {
        displayName,
        color: this.getNextColor(updatedRegistry),
        category: null,
        description: '',
        created_at: now,
        updated_at: now
      }

      updatedRegistry[slug] = tag
      syncedTags.push({ slug, tag })
    }

    console.log(`Synced ${syncedTags.length} orphan tag(s):`, syncedTags.map(t => t.slug))
    return { syncedTags, registry: updatedRegistry }
  }

  /**
   * Search tags by query (for autocomplete)
   */
  searchTags(tagRegistry, query) {
    if (!query || typeof query !== 'string') return []

    const q = query.toLowerCase().trim()
    if (!q) return []

    return Object.entries(tagRegistry)
      .filter(([slug, tag]) =>
        slug.includes(q) ||
        tag.displayName.toLowerCase().includes(q)
      )
      .map(([slug, tag]) => ({ slug, ...tag }))
      .slice(0, 10) // Limit autocomplete results
  }

  /**
   * Get or create tag - useful for TagInput
   * If tag exists, returns existing slug
   * If not, creates new tag and returns slug
   */
  getOrCreateTag(tagRegistry, displayName, options = {}) {
    const slug = this.slugify(displayName)

    if (tagRegistry[slug]) {
      return { slug, tag: tagRegistry[slug], created: false }
    }

    const result = this.createTag(tagRegistry, displayName, options)
    if (result.error) {
      return result
    }

    return { ...result, created: true }
  }
}

export const tagService = new TagService()
