# Stage 18 — Tag Infrastructure

## Context Window
`/clear` then load: `CLAUDE.md`, `docs/LIBRARY_SCHEMA.md`, `docs/DESIGN_SYSTEM.md`
Also read: `src/store/libraryStore.js`, `src/components/ui/Tag.jsx`

## Goal
Establish the global tag registry, create a reusable TagInput component with autocomplete, and enable tagging documents. Tags are stored with a slug (lowercase-hyphenated) but displayed using the original user input (`displayName`).

## Key Concepts

**Tag Storage Philosophy:**
- `slug`: lowercase-hyphenated key, used for matching/filtering/deduplication
- `displayName`: original user input, used for UI display

**Three Distinct Tag Contexts:**
1. `metadata.keywords` — machine-extracted from paper (read-only, from CrossRef/AI)
2. `user_data.tags` — user-assigned organizational tags (editable)
3. `notes[docId].tags` — tags specific to personal notes (editable)

This stage focuses on `user_data.tags` and the global `tag_registry`.

---

## Claude Code Tasks

### 1. Initialize tag_registry in library.json

Update `LibraryService.js` to include `tag_registry` and `smart_collections` when initializing a new library:

```javascript
// In LibraryService.js - defaults() method
defaults() {
  return {
    version: '1.0',
    schema_updated: new Date().toISOString().split('T')[0],
    last_modified: new Date().toISOString(),
    last_modified_by: null,
    folders: [],
    documents: {},
    tag_registry: {},      // Add this
    smart_collections: []  // Add this
  }
}
```

### 2. `src/services/tags/TagService.js`

```javascript
import { nanoid } from 'nanoid'

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
  getNextColor(existingTags) {
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
  getAllTagsWithCounts(tagRegistry, documents) {
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
      for (const [docId, note] of Object.entries(notes)) {
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
    for (const [docId, note] of Object.entries(notes)) {
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
    for (const [docId, note] of Object.entries(notes)) {
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
   * Search tags by query (for autocomplete)
   */
  searchTags(tagRegistry, query) {
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
}

export const tagService = new TagService()
```

### 3. `src/components/ui/TagInput.jsx` + `TagInput.module.css`

A reusable component for adding/removing tags with autocomplete.

```jsx
// src/components/ui/TagInput.jsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { Tag } from './Tag'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagInput.module.css'

export function TagInput({
  tags = [],           // Array of tag slugs
  onChange,            // (newTags: string[]) => void
  placeholder = 'Add tag...',
  maxTags = 20,
  disabled = false,
  autoFocus = false
}) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const createTag = useLibraryStore(s => s.createTag)

  // Get suggestions based on input
  const suggestions = tagService.searchTags(tagRegistry, input)
    .filter(t => !tags.includes(t.slug)) // Exclude already-added tags
    .slice(0, 6)

  // Get display names for current tags
  const getDisplayName = (slug) => {
    return tagRegistry[slug]?.displayName || slug
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    setShowSuggestions(true)
    setSelectedIndex(0)
  }

  const addTag = useCallback(async (slugOrDisplayName) => {
    if (disabled || tags.length >= maxTags) return

    let slug = slugOrDisplayName

    // Check if this matches an existing tag by slug
    if (!tagRegistry[slug]) {
      // Try to find by displayName
      const existing = Object.entries(tagRegistry).find(
        ([s, t]) => t.displayName.toLowerCase() === slugOrDisplayName.toLowerCase()
      )

      if (existing) {
        slug = existing[0]
      } else {
        // Create new tag
        const result = await createTag(slugOrDisplayName)
        if (result.error) {
          // Tag might already exist with this slug
          slug = result.existingSlug || tagService.slugify(slugOrDisplayName)
        } else {
          slug = result.slug
        }
      }
    }

    if (slug && !tags.includes(slug)) {
      onChange([...tags, slug])
    }

    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }, [disabled, tags, maxTags, tagRegistry, createTag, onChange])

  const removeTag = (slug) => {
    if (disabled) return
    onChange(tags.filter(t => t !== slug))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0 && showSuggestions) {
        addTag(suggestions[selectedIndex].slug)
      } else if (input.trim()) {
        addTag(input.trim())
      }
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      // Remove last tag on backspace if input is empty
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.tagsWrapper}>
        {tags.map(slug => (
          <Tag
            key={slug}
            label={getDisplayName(slug)}
            color={tagRegistry[slug]?.color}
            onRemove={disabled ? undefined : () => removeTag(slug)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => input && setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled || tags.length >= maxTags}
          autoFocus={autoFocus}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((tag, index) => (
            <button
              key={tag.slug}
              className={`${styles.suggestion} ${index === selectedIndex ? styles.selected : ''}`}
              onClick={() => addTag(tag.slug)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span
                className={styles.colorDot}
                style={{ backgroundColor: tag.color }}
              />
              <span className={styles.suggestionName}>{tag.displayName}</span>
              {tag.category && (
                <span className={styles.suggestionCategory}>{tag.category}</span>
              )}
            </button>
          ))}
          {input.trim() && !suggestions.find(s =>
            s.displayName.toLowerCase() === input.trim().toLowerCase()
          ) && (
            <button
              className={`${styles.suggestion} ${styles.createNew}`}
              onClick={() => addTag(input.trim())}
            >
              Create "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

```css
/* src/components/ui/TagInput.module.css */
.container {
  position: relative;
  width: 100%;
}

.tagsWrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  min-height: 40px;
  align-items: center;
}

.tagsWrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-dim);
}

.input {
  flex: 1;
  min-width: 100px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  padding: 4px;
}

.input::placeholder {
  color: var(--text-muted);
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.suggestion:hover,
.suggestion.selected {
  background: var(--bg-hover);
}

.colorDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.suggestionName {
  flex: 1;
}

.suggestionCategory {
  color: var(--text-muted);
  font-size: 10px;
  text-transform: uppercase;
}

.createNew {
  color: var(--accent);
  border-top: 1px solid var(--border-subtle);
}

.createNew:hover {
  background: var(--accent-dim);
}
```

### 4. Update `src/components/ui/Tag.jsx`

Update to support colors from the registry:

```jsx
import styles from './Tag.module.css'

export function Tag({ label, color, onRemove }) {
  return (
    <span
      className={styles.tag}
      style={color ? {
        '--tag-color': color,
        '--tag-bg': `${color}20`,
        '--tag-border': `${color}40`
      } : undefined}
    >
      {label}
      {onRemove && (
        <button
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Remove tag ${label}`}
        >
          ×
        </button>
      )}
    </span>
  )
}
```

Update CSS to use custom properties with fallbacks:

```css
/* Update src/components/ui/Tag.module.css */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--tag-color, var(--accent));
  background: var(--tag-bg, var(--accent-dim));
  border: 1px solid var(--tag-border, var(--accent-border));
  border-radius: var(--radius-sm);
  white-space: nowrap;
}

.remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.remove:hover {
  opacity: 1;
}
```

### 5. Update `libraryStore.js`

Add tag registry state and actions:

```javascript
// Add to libraryStore.js

// State
tagRegistry: {},

// Actions
loadTagRegistry: () => {
  const library = get().library
  set({ tagRegistry: library?.tag_registry || {} })
},

createTag: async (displayName, options = {}) => {
  const { tagRegistry, library, saveLibrary } = get()
  const result = tagService.createTag(tagRegistry, displayName, options)

  if (result.error) return result

  const newRegistry = { ...tagRegistry, [result.slug]: result.tag }
  const newLibrary = { ...library, tag_registry: newRegistry }

  set({ tagRegistry: newRegistry, library: newLibrary })
  await saveLibrary()

  return result
},

updateTag: async (slug, updates) => {
  const { tagRegistry, library, documents, saveLibrary } = get()
  const notes = {} // Load from notesStore or pass in

  const result = tagService.updateTag(tagRegistry, documents, notes, slug, updates)
  if (result.error) return result

  // Update registry
  const newRegistry = { ...tagRegistry }
  delete newRegistry[result.oldSlug]
  newRegistry[result.newSlug] = result.tag

  // Update documents if slug changed
  const newDocuments = { ...documents }
  for (const { docId, newTags } of result.docUpdates) {
    newDocuments[docId] = {
      ...newDocuments[docId],
      user_data: { ...newDocuments[docId].user_data, tags: newTags }
    }
  }

  const newLibrary = {
    ...library,
    tag_registry: newRegistry,
    documents: newDocuments
  }

  set({ tagRegistry: newRegistry, library: newLibrary, documents: newDocuments })
  await saveLibrary()

  return result
},

deleteTag: async (slug) => {
  const { tagRegistry, library, documents, saveLibrary } = get()
  const notes = {} // Load from notesStore

  const result = tagService.deleteTag(tagRegistry, documents, notes, slug)
  if (result.error) return result

  // Remove from registry
  const newRegistry = { ...tagRegistry }
  delete newRegistry[slug]

  // Update documents
  const newDocuments = { ...documents }
  for (const { docId, newTags } of result.affectedDocs) {
    newDocuments[docId] = {
      ...newDocuments[docId],
      user_data: { ...newDocuments[docId].user_data, tags: newTags }
    }
  }

  const newLibrary = {
    ...library,
    tag_registry: newRegistry,
    documents: newDocuments
  }

  set({ tagRegistry: newRegistry, library: newLibrary, documents: newDocuments })
  await saveLibrary()

  // Also update notes (coordinate with notesStore)
  // notesStore.getState().removeTagFromAllNotes(slug)

  return result
},

addTagToDocument: async (docId, slug) => {
  const { documents, tagRegistry, library, saveLibrary } = get()
  const doc = documents[docId]
  if (!doc) return { error: 'Document not found' }

  const currentTags = doc.user_data?.tags || []
  if (currentTags.includes(slug)) return { error: 'Tag already added' }

  // Create tag if it doesn't exist
  if (!tagRegistry[slug]) {
    return { error: 'Tag not found in registry' }
  }

  const newTags = [...currentTags, slug]
  const newDoc = {
    ...doc,
    user_data: { ...doc.user_data, tags: newTags }
  }
  const newDocuments = { ...documents, [docId]: newDoc }
  const newLibrary = { ...library, documents: newDocuments }

  set({ documents: newDocuments, library: newLibrary })
  await saveLibrary()

  return { success: true }
},

removeTagFromDocument: async (docId, slug) => {
  const { documents, library, saveLibrary } = get()
  const doc = documents[docId]
  if (!doc) return { error: 'Document not found' }

  const currentTags = doc.user_data?.tags || []
  const newTags = currentTags.filter(t => t !== slug)

  const newDoc = {
    ...doc,
    user_data: { ...doc.user_data, tags: newTags }
  }
  const newDocuments = { ...documents, [docId]: newDoc }
  const newLibrary = { ...library, documents: newDocuments }

  set({ documents: newDocuments, library: newLibrary })
  await saveLibrary()

  return { success: true }
},

setDocumentTags: async (docId, tags) => {
  const { documents, library, saveLibrary } = get()
  const doc = documents[docId]
  if (!doc) return { error: 'Document not found' }

  const newDoc = {
    ...doc,
    user_data: { ...doc.user_data, tags }
  }
  const newDocuments = { ...documents, [docId]: newDoc }
  const newLibrary = { ...library, documents: newDocuments }

  set({ documents: newDocuments, library: newLibrary })
  await saveLibrary()

  return { success: true }
},

// Call this when library loads
// In loadLibrary action, add:
// set({ tagRegistry: library.tag_registry || {} })
```

### 6. Add tag editing to `EditMetadataModal.jsx`

Add a separate section for user tags (distinct from keywords):

```jsx
// In EditMetadataModal.jsx, add import
import { TagInput } from '../ui/TagInput'

// In the component, add state
const [userTags, setUserTags] = useState(doc.user_data?.tags || [])

// In the modal body, add a new section after keywords:
<div className={styles.section}>
  <label className={styles.label}>Tags (for organization)</label>
  <p className={styles.hint}>
    Your personal tags for organizing this document.
    Different from keywords extracted from the paper.
  </p>
  <TagInput
    tags={userTags}
    onChange={setUserTags}
    placeholder="Add organizational tags..."
  />
</div>

// In handleSave, include tags:
await setDocumentTags(doc.id, userTags)
```

### 7. Add tag editing to DocCard context menu

In `DocCard.jsx`, add "Edit Tags..." option to context menu that opens a small popover:

```jsx
// Add to context menu items
{ label: 'Edit Tags...', action: () => setShowTagEditor(true) }

// Add TagInput popover when showTagEditor is true
{showTagEditor && (
  <div className={styles.tagEditorPopover}>
    <TagInput
      tags={doc.user_data?.tags || []}
      onChange={(newTags) => {
        setDocumentTags(doc.id, newTags)
        setShowTagEditor(false)
      }}
      autoFocus
    />
  </div>
)}
```

### 8. Display tags with colors in DocCard

Update the tags display section to use colors from registry:

```jsx
{tags.length > 0 && (
  <div className={styles.tags}>
    {tags.slice(0, 3).map(slug => {
      const tagData = tagRegistry[slug]
      return (
        <Tag
          key={slug}
          label={tagData?.displayName || slug}
          color={tagData?.color}
        />
      )
    })}
    {tags.length > 3 && (
      <span className={styles.moreTags}>+{tags.length - 3}</span>
    )}
  </div>
)}
```

---

## Verification

1. Create a new tag via TagInput
2. Tag appears in autocomplete suggestions
3. Tags display with colors in DocCard
4. Edit tags via context menu on DocCard
5. Edit tags via EditMetadataModal
6. Delete a tag — confirm it's removed from all documents
7. Tags persist after refresh (saved to library.json)

## Commit
```bash
git commit -m "feat: tag infrastructure — registry, TagInput with autocomplete, document tagging"
```

---

# Stage 19 — Tag Navigation & Filtering

## Context Window
`/clear` then load: `CLAUDE.md`, `docs/LIBRARY_SCHEMA.md`, `docs/DESIGN_SYSTEM.md`
Also read: `src/components/layout/Sidebar.jsx`, `src/components/library/DocList.jsx`, `src/store/libraryStore.js`

## Goal
Add a Tags section to the sidebar for browsing all tags, enable tag-based document filtering with multi-select and AND/OR logic, and show active filters as removable chips.

---

## Claude Code Tasks

### 1. `src/components/library/TagsList.jsx` + `TagsList.module.css`

```jsx
import { useState, useMemo } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagsList.module.css'

export function TagsList() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const selectedTags = useLibraryStore(s => s.selectedTags)
  const tagFilterMode = useLibraryStore(s => s.tagFilterMode)
  const toggleTagSelection = useLibraryStore(s => s.toggleTagSelection)
  const setTagFilterMode = useLibraryStore(s => s.setTagFilterMode)
  const clearTagFilter = useLibraryStore(s => s.clearTagFilter)

  // Get tags with counts
  const tagsWithCounts = useMemo(() => {
    return tagService.getAllTagsWithCounts(tagRegistry, documents)
  }, [tagRegistry, documents])

  // Filter by search
  const filteredTags = useMemo(() => {
    if (!search.trim()) return tagsWithCounts
    const q = search.toLowerCase()
    return tagsWithCounts.filter(t =>
      t.displayName.toLowerCase().includes(q) ||
      t.slug.includes(q)
    )
  }, [tagsWithCounts, search])

  // Group by category
  const groupedTags = useMemo(() => {
    const groups = {}
    for (const tag of filteredTags) {
      const cat = tag.category || 'uncategorized'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(tag)
    }
    return groups
  }, [filteredTags])

  if (Object.keys(tagRegistry).length === 0) {
    return null // Don't show section if no tags exist
  }

  return (
    <div className={styles.container}>
      <button
        className={styles.header}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
        <span className={styles.headerTitle}>Tags</span>
        <span className={styles.headerCount}>{tagsWithCounts.length}</span>
      </button>

      {!collapsed && (
        <>
          {tagsWithCounts.length > 8 && (
            <div className={styles.searchWrapper}>
              <input
                type="text"
                className={styles.search}
                placeholder="Filter tags..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {selectedTags.length > 0 && (
            <div className={styles.filterControls}>
              <button
                className={`${styles.modeButton} ${tagFilterMode === 'AND' ? styles.active : ''}`}
                onClick={() => setTagFilterMode('AND')}
              >
                AND
              </button>
              <button
                className={`${styles.modeButton} ${tagFilterMode === 'OR' ? styles.active : ''}`}
                onClick={() => setTagFilterMode('OR')}
              >
                OR
              </button>
              <button
                className={styles.clearButton}
                onClick={clearTagFilter}
              >
                Clear
              </button>
            </div>
          )}

          <div className={styles.tagsList}>
            {Object.entries(groupedTags).map(([category, tags]) => (
              <div key={category} className={styles.group}>
                {category !== 'uncategorized' && (
                  <div className={styles.categoryLabel}>{category}</div>
                )}
                {tags.map(tag => (
                  <button
                    key={tag.slug}
                    className={`${styles.tagItem} ${selectedTags.includes(tag.slug) ? styles.selected : ''}`}
                    onClick={() => toggleTagSelection(tag.slug)}
                  >
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className={styles.tagName}>{tag.displayName}</span>
                    <span className={styles.tagCount}>{tag.documentCount}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

```css
/* src/components/library/TagsList.module.css */
.container {
  padding: 0 8px;
}

.header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  text-align: left;
}

.header:hover {
  color: var(--text-primary);
}

.headerIcon {
  font-size: 10px;
  width: 12px;
}

.headerTitle {
  flex: 1;
}

.headerCount {
  color: var(--text-muted);
  font-weight: 400;
}

.searchWrapper {
  padding: 0 8px 8px;
}

.search {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
}

.search:focus {
  outline: none;
  border-color: var(--accent);
}

.filterControls {
  display: flex;
  gap: 4px;
  padding: 0 8px 8px;
}

.modeButton {
  padding: 4px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.modeButton.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

.clearButton {
  margin-left: auto;
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.clearButton:hover {
  color: var(--error);
}

.tagsList {
  max-height: 300px;
  overflow-y: auto;
}

.group {
  margin-bottom: 4px;
}

.categoryLabel {
  padding: 4px 8px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tagItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.tagItem:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tagItem.selected {
  background: var(--bg-selected);
  color: var(--text-primary);
}

.colorDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tagName {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tagCount {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}
```

### 2. Update `Sidebar.jsx`

Add the TagsList component below the folder tree:

```jsx
import { TagsList } from '../library/TagsList'

// In the sidebar JSX, after FolderTree:
<div className={styles.section}>
  <FolderTree />
</div>

<div className={styles.divider} />

<div className={styles.section}>
  <TagsList />
</div>
```

### 3. Update `libraryStore.js` — Tag filter state

```javascript
// Add state
selectedTags: [],
tagFilterMode: 'AND', // 'AND' | 'OR'

// Add actions
toggleTagSelection: (slug) => {
  const { selectedTags } = get()
  const newTags = selectedTags.includes(slug)
    ? selectedTags.filter(t => t !== slug)
    : [...selectedTags, slug]
  set({ selectedTags: newTags })
},

setSelectedTags: (tags) => {
  set({ selectedTags: tags })
},

setTagFilterMode: (mode) => {
  set({ tagFilterMode: mode })
},

clearTagFilter: () => {
  set({ selectedTags: [], tagFilterMode: 'AND' })
},
```

### 4. Update `DocList.jsx` — Tag filtering

Update the filtering logic to include tag filters:

```jsx
import { useLibraryStore } from '../../store/libraryStore'

// In component
const selectedTags = useLibraryStore(s => s.selectedTags)
const tagFilterMode = useLibraryStore(s => s.tagFilterMode)

// Update filterDocs function
const filterDocs = (docs) => {
  let filtered = docs

  // Apply existing filters (starred, unread, pending)
  if (activeFilter === 'starred') {
    filtered = filtered.filter(d => d.user_data?.starred)
  } else if (activeFilter === 'unread') {
    filtered = filtered.filter(d => !d.user_data?.read)
  } else if (activeFilter === 'pending') {
    filtered = filtered.filter(d =>
      !d.index_status || d.index_status.status !== 'indexed'
    )
  }

  // Apply tag filter
  if (selectedTags.length > 0) {
    filtered = filtered.filter(doc => {
      const docTags = doc.user_data?.tags || []
      if (tagFilterMode === 'AND') {
        return selectedTags.every(t => docTags.includes(t))
      } else {
        return selectedTags.some(t => docTags.includes(t))
      }
    })
  }

  return filtered
}
```

### 5. `src/components/library/ActiveFilters.jsx` + `ActiveFilters.module.css`

Show active filters as removable chips above the document list:

```jsx
import { useLibraryStore } from '../../store/libraryStore'
import { Tag } from '../ui/Tag'
import styles from './ActiveFilters.module.css'

export function ActiveFilters() {
  const selectedTags = useLibraryStore(s => s.selectedTags)
  const tagFilterMode = useLibraryStore(s => s.tagFilterMode)
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const toggleTagSelection = useLibraryStore(s => s.toggleTagSelection)
  const clearTagFilter = useLibraryStore(s => s.clearTagFilter)
  const activeFilter = useLibraryStore(s => s.activeFilter)
  const setActiveFilter = useLibraryStore(s => s.setActiveFilter)

  if (selectedTags.length === 0 && !activeFilter) {
    return null
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>Filters:</span>

      {activeFilter && activeFilter !== 'all' && (
        <button
          className={styles.filterChip}
          onClick={() => setActiveFilter('all')}
        >
          {activeFilter}
          <span className={styles.remove}>×</span>
        </button>
      )}

      {selectedTags.length > 1 && (
        <span className={styles.mode}>{tagFilterMode}</span>
      )}

      {selectedTags.map(slug => {
        const tag = tagRegistry[slug]
        return (
          <Tag
            key={slug}
            label={tag?.displayName || slug}
            color={tag?.color}
            onRemove={() => toggleTagSelection(slug)}
          />
        )
      })}

      {(selectedTags.length > 0 || activeFilter) && (
        <button
          className={styles.clearAll}
          onClick={() => {
            clearTagFilter()
            setActiveFilter('all')
          }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
```

```css
/* src/components/library/ActiveFilters.module.css */
.container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
}

.label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
}

.mode {
  padding: 2px 6px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.filterChip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.filterChip:hover {
  background: var(--bg-hover);
}

.remove {
  opacity: 0.6;
}

.clearAll {
  margin-left: auto;
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.clearAll:hover {
  color: var(--error);
}
```

### 6. Add ActiveFilters to DocList

```jsx
import { ActiveFilters } from './ActiveFilters'

// In DocList JSX, above the document list:
<ActiveFilters />
```

### 7. Handle "view all documents with this tag" when clicking tag in sidebar

When a user clicks a tag in the sidebar:
- Clear folder selection (show documents from ALL folders)
- Add the tag to selectedTags
- DocList shows all documents with that tag across the library

```javascript
// In libraryStore
selectTagFilter: (slug) => {
  set({
    selectedTags: [slug],
    selectedFolderId: null,  // Clear folder selection
    tagFilterMode: 'AND'
  })
},
```

Update TagsList to use this on click:
```jsx
onClick={() => {
  if (selectedTags.length === 0) {
    selectTagFilter(tag.slug)  // Single click = filter to this tag only
  } else {
    toggleTagSelection(tag.slug)  // Multi-select mode
  }
}}
```

Or use Shift+Click for multi-select behavior.

---

## Verification

1. Tags section appears in sidebar when tags exist
2. Clicking a tag filters documents across all folders
3. Multi-select with AND shows only documents having ALL selected tags
4. Multi-select with OR shows documents having ANY selected tag
5. Active filters appear as removable chips
6. Clear all removes both tag and status filters
7. Tag counts update when documents are tagged/untagged

## Commit
```bash
git commit -m "feat: tag navigation — sidebar section, multi-tag filtering with AND/OR, active filters"
```

---

# Stage 20 — Tag-Scoped AI Chat

## Context Window
`/clear` then load: `CLAUDE.md`, `docs/LIBRARY_SCHEMA.md`
Also read: `src/components/ai/ScopeSelector.jsx`, `src/store/aiStore.js`, `src/services/indexing/IndexService.js`

## Goal
Enable AI chat scoped to documents with specific tags. Support multi-tag selection with AND/OR operators. When chatting with a tag scope, the AI searches only documents matching the tag criteria.

---

## Claude Code Tasks

### 1. Update `aiStore.js` — Tag scope state

```javascript
// Add state
scopeType: 'document', // 'document' | 'folder' | 'library' | 'tags'
scopeTags: [],
scopeTagMode: 'AND', // 'AND' | 'OR'

// Add actions
setScopeType: (type) => set({ scopeType: type }),

setScopeTags: (tags) => set({ scopeTags: tags }),

toggleScopeTag: (slug) => {
  const { scopeTags } = get()
  const newTags = scopeTags.includes(slug)
    ? scopeTags.filter(t => t !== slug)
    : [...scopeTags, slug]
  set({ scopeTags: newTags })
},

setScopeTagMode: (mode) => set({ scopeTagMode: mode }),

clearScopeTags: () => set({ scopeTags: [], scopeTagMode: 'AND' }),

// Update getContextDocuments to handle tag scope
getContextDocuments: () => {
  const { scopeType, scopeTags, scopeTagMode } = get()
  const { documents, selectedFolderId, selectedDocId } = useLibraryStore.getState()

  if (scopeType === 'document') {
    return selectedDocId ? [documents[selectedDocId]] : []
  }

  if (scopeType === 'folder') {
    return Object.values(documents).filter(d => d.folder_id === selectedFolderId)
  }

  if (scopeType === 'tags') {
    return Object.values(documents).filter(doc => {
      const docTags = doc.user_data?.tags || []
      if (scopeTagMode === 'AND') {
        return scopeTags.every(t => docTags.includes(t))
      } else {
        return scopeTags.some(t => docTags.includes(t))
      }
    })
  }

  // library scope
  return Object.values(documents)
},

getScopeDescription: () => {
  const { scopeType, scopeTags, scopeTagMode } = get()
  const { tagRegistry } = useLibraryStore.getState()

  if (scopeType === 'document') return 'Current document'
  if (scopeType === 'folder') return 'Current folder'
  if (scopeType === 'library') return 'Entire library'

  if (scopeType === 'tags' && scopeTags.length > 0) {
    const names = scopeTags.map(s => tagRegistry[s]?.displayName || s)
    const connector = scopeTagMode === 'AND' ? ' & ' : ' | '
    return `Tags: ${names.join(connector)}`
  }

  return 'No scope selected'
},
```

### 2. `src/components/ai/TagScopeSelector.jsx` + `TagScopeSelector.module.css`

```jsx
import { useState, useRef, useEffect } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { useAIStore } from '../../store/aiStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagScopeSelector.module.css'

export function TagScopeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const scopeTags = useAIStore(s => s.scopeTags)
  const scopeTagMode = useAIStore(s => s.scopeTagMode)
  const toggleScopeTag = useAIStore(s => s.toggleScopeTag)
  const setScopeTagMode = useAIStore(s => s.setScopeTagMode)
  const clearScopeTags = useAIStore(s => s.clearScopeTags)

  // Get tags with counts
  const tagsWithCounts = tagService.getAllTagsWithCounts(tagRegistry, documents)

  // Filter by search
  const filteredTags = search.trim()
    ? tagsWithCounts.filter(t =>
        t.displayName.toLowerCase().includes(search.toLowerCase())
      )
    : tagsWithCounts

  // Calculate matching document count
  const matchingDocCount = Object.values(documents).filter(doc => {
    if (scopeTags.length === 0) return false
    const docTags = doc.user_data?.tags || []
    if (scopeTagMode === 'AND') {
      return scopeTags.every(t => docTags.includes(t))
    } else {
      return scopeTags.some(t => docTags.includes(t))
    }
  }).length

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={styles.label}>
          {scopeTags.length === 0
            ? 'Select tags...'
            : `${scopeTags.length} tag${scopeTags.length > 1 ? 's' : ''} (${matchingDocCount} docs)`
          }
        </span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.controls}>
            <input
              type="text"
              className={styles.search}
              placeholder="Search tags..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />

            {scopeTags.length > 1 && (
              <div className={styles.modeToggle}>
                <button
                  className={`${styles.modeBtn} ${scopeTagMode === 'AND' ? styles.active : ''}`}
                  onClick={() => setScopeTagMode('AND')}
                >
                  AND
                </button>
                <button
                  className={`${styles.modeBtn} ${scopeTagMode === 'OR' ? styles.active : ''}`}
                  onClick={() => setScopeTagMode('OR')}
                >
                  OR
                </button>
              </div>
            )}
          </div>

          <div className={styles.tagList}>
            {filteredTags.map(tag => (
              <label key={tag.slug} className={styles.tagOption}>
                <input
                  type="checkbox"
                  checked={scopeTags.includes(tag.slug)}
                  onChange={() => toggleScopeTag(tag.slug)}
                />
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: tag.color }}
                />
                <span className={styles.tagName}>{tag.displayName}</span>
                <span className={styles.tagCount}>{tag.documentCount}</span>
              </label>
            ))}

            {filteredTags.length === 0 && (
              <div className={styles.empty}>No tags found</div>
            )}
          </div>

          {scopeTags.length > 0 && (
            <div className={styles.footer}>
              <span className={styles.matchCount}>
                {matchingDocCount} document{matchingDocCount !== 1 ? 's' : ''} match
              </span>
              <button
                className={styles.clearBtn}
                onClick={clearScopeTags}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

```css
/* src/components/ai/TagScopeSelector.module.css */
.container {
  position: relative;
  width: 100%;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
}

.trigger:hover {
  border-color: var(--border-default);
}

.arrow {
  font-size: 10px;
  color: var(--text-muted);
}

.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.controls {
  padding: 8px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
}

.search:focus {
  outline: none;
  border-color: var(--accent);
}

.modeToggle {
  display: flex;
  gap: 4px;
}

.modeBtn {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.modeBtn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

.tagList {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tagOption {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
}

.tagOption:hover {
  background: var(--bg-hover);
}

.tagOption input[type="checkbox"] {
  accent-color: var(--accent);
}

.colorDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.tagName {
  flex: 1;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-primary);
}

.tagCount {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

.empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-surface);
}

.matchCount {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
}

.clearBtn {
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}

.clearBtn:hover {
  color: var(--error);
}
```

### 3. Update `ScopeSelector.jsx`

Add "Tags" as a scope option:

```jsx
import { TagScopeSelector } from './TagScopeSelector'

// Scope options
const SCOPE_OPTIONS = [
  { value: 'document', label: 'Current Document', icon: '📄' },
  { value: 'folder', label: 'Current Folder', icon: '📁' },
  { value: 'library', label: 'Entire Library', icon: '📚' },
  { value: 'tags', label: 'By Tags...', icon: '🏷️' },
]

// When 'tags' is selected, show TagScopeSelector below
{scopeType === 'tags' && (
  <div className={styles.tagScopeWrapper}>
    <TagScopeSelector />
  </div>
)}
```

### 4. Update `IndexService.js` — Tag-based search

```javascript
// Add method to search only within documents matching tags
async searchByTags(query, tagSlugs, tagMode, topK = 10) {
  const { documents } = useLibraryStore.getState()

  // Get document IDs matching tag criteria
  const matchingDocIds = Object.entries(documents)
    .filter(([id, doc]) => {
      const docTags = doc.user_data?.tags || []
      if (tagMode === 'AND') {
        return tagSlugs.every(t => docTags.includes(t))
      } else {
        return tagSlugs.some(t => docTags.includes(t))
      }
    })
    .map(([id]) => id)

  if (matchingDocIds.length === 0) {
    return []
  }

  // Search with document ID filter
  return this.search(query, topK, { filterDocIds: matchingDocIds })
}

// Update search method to support filterDocIds option
async search(query, topK = 10, options = {}) {
  const { filterDocIds } = options

  // ... existing embedding generation ...

  // When filtering results, only include chunks from matching docs
  let results = await this.vectorSearch(queryEmbedding, topK * 2)

  if (filterDocIds) {
    results = results.filter(r => filterDocIds.includes(r.doc_id))
  }

  return results.slice(0, topK)
}
```

### 5. Update ChatPanel to use tag scope

```jsx
// In ChatPanel, when building context for AI:
const buildContext = async (query) => {
  const { scopeType, scopeTags, scopeTagMode } = useAIStore.getState()

  if (scopeType === 'tags' && scopeTags.length > 0) {
    return await indexService.searchByTags(query, scopeTags, scopeTagMode)
  }

  // ... existing scope handling ...
}

// Display current scope in chat header
<div className={styles.scopeIndicator}>
  {getScopeDescription()}
  <span className={styles.docCount}>
    ({getContextDocuments().length} documents)
  </span>
</div>
```

### 6. Persist scope in chat history

When saving a conversation, include the tag scope:

```javascript
// In chat_history.json conversation record
{
  "scope": {
    "type": "tags",
    "tags": ["thermal", "degradation"],
    "tagMode": "AND",
    "doc_count": 8
  }
}
```

---

## Verification

1. Select "By Tags..." in scope selector
2. Choose multiple tags with AND/OR
3. Document count updates correctly
4. AI chat only searches documents matching tag criteria
5. Scope description shows correctly: "Tags: Thermal & Degradation (8 docs)"
6. Chat history preserves tag scope

## Commit
```bash
git commit -m "feat: tag-scoped AI chat — multi-tag selection with AND/OR operators"
```

---

# Stage 21 — Smart Collections & Tag Management

## Context Window
`/clear` then load: `CLAUDE.md`, `docs/LIBRARY_SCHEMA.md`, `docs/DESIGN_SYSTEM.md`
Also read: `src/services/tags/TagService.js`, `src/components/library/TagsList.jsx`

## Goal
Implement advanced tag features: tag colors/categories editing, smart collections (saved tag filters), bulk tag operations, tag rename/merge, and AI-powered tag suggestions on document upload.

---

## Claude Code Tasks

### Part A: Tag Colors & Categories

#### 1. `src/components/tags/TagColorPicker.jsx`

```jsx
import styles from './TagColorPicker.module.css'

const PRESET_COLORS = [
  '#4A90D9', '#E85D75', '#50C878', '#9B59B6',
  '#F39C12', '#1ABC9C', '#E67E22', '#3498DB',
  '#2ECC71', '#E74C3C', '#9B59B6', '#34495E',
]

export function TagColorPicker({ value, onChange }) {
  return (
    <div className={styles.container}>
      <div className={styles.presets}>
        {PRESET_COLORS.map(color => (
          <button
            key={color}
            className={`${styles.colorBtn} ${value === color ? styles.selected : ''}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Select color ${color}`}
          />
        ))}
      </div>
      <div className={styles.custom}>
        <label className={styles.customLabel}>Custom:</label>
        <input
          type="color"
          value={value || '#4A90D9'}
          onChange={e => onChange(e.target.value)}
          className={styles.colorInput}
        />
      </div>
    </div>
  )
}
```

#### 2. `src/components/tags/TagEditModal.jsx`

Modal for editing tag displayName, color, category, description. Also supports delete.

```jsx
import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { TagColorPicker } from './TagColorPicker'
import { useLibraryStore } from '../../store/libraryStore'
import styles from './TagEditModal.module.css'

export function TagEditModal({ slug, onClose }) {
  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const updateTag = useLibraryStore(s => s.updateTag)
  const deleteTag = useLibraryStore(s => s.deleteTag)

  const tag = tagRegistry[slug]

  const [displayName, setDisplayName] = useState(tag?.displayName || '')
  const [color, setColor] = useState(tag?.color || '#4A90D9')
  const [category, setCategory] = useState(tag?.category || '')
  const [description, setDescription] = useState(tag?.description || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Count documents with this tag
  const docCount = Object.values(documents).filter(
    d => d.user_data?.tags?.includes(slug)
  ).length

  // Get existing categories for autocomplete
  const existingCategories = [...new Set(
    Object.values(tagRegistry)
      .map(t => t.category)
      .filter(Boolean)
  )]

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateTag(slug, { displayName, color, category, description })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteTag(slug)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  if (!tag) return null

  return (
    <Modal title="Edit Tag" onClose={onClose} size="small">
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            type="text"
            className={styles.input}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Tag name"
          />
          <p className={styles.hint}>Changing the name may change the tag URL/slug.</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Color</label>
          <TagColorPicker value={color} onChange={setColor} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Category (optional)</label>
          <input
            type="text"
            className={styles.input}
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="e.g., topics, status, projects"
            list="category-suggestions"
          />
          <datalist id="category-suggestions">
            {existingCategories.map(cat => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Description (optional)</label>
          <textarea
            className={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What is this tag for?"
            rows={2}
          />
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!displayName.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        <div className={styles.dangerZone}>
          <div className={styles.dangerHeader}>Danger Zone</div>
          {!showDeleteConfirm ? (
            <button
              className={styles.deleteBtn}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete this tag
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <p className={styles.deleteWarning}>
                This will remove the tag from {docCount} document{docCount !== 1 ? 's' : ''}.
                This action cannot be undone.
              </p>
              <div className={styles.deleteActions}>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Tag'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
```

### Part B: Smart Collections

#### 3. `src/services/tags/SmartCollectionService.js`

```javascript
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
    if (tags.length > 0) {
      tagMatch = tagMode === 'AND'
        ? tags.every(t => docTags.includes(t))
        : tags.some(t => docTags.includes(t))
    }

    // Additional filters
    const starredMatch = starred === null || doc.user_data?.starred === starred
    const readMatch = read === null || doc.user_data?.read === read

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
```

#### 4. `src/components/tags/SmartCollectionModal.jsx`

Modal for creating/editing smart collections:

```jsx
import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { TagInput } from '../ui/TagInput'
import { useLibraryStore } from '../../store/libraryStore'
import { smartCollectionService } from '../../services/tags/SmartCollectionService'
import styles from './SmartCollectionModal.module.css'

export function SmartCollectionModal({ collection, onClose }) {
  const documents = useLibraryStore(s => s.documents)
  const createSmartCollection = useLibraryStore(s => s.createSmartCollection)
  const updateSmartCollection = useLibraryStore(s => s.updateSmartCollection)

  const [name, setName] = useState(collection?.name || '')
  const [tags, setTags] = useState(collection?.filter?.tags || [])
  const [tagMode, setTagMode] = useState(collection?.filter?.tagMode || 'AND')
  const [starred, setStarred] = useState(collection?.filter?.starred ?? null)
  const [read, setRead] = useState(collection?.filter?.read ?? null)
  const [isSaving, setIsSaving] = useState(false)

  // Preview matching documents
  const filter = { tags, tagMode, starred, read }
  const matchingDocIds = smartCollectionService.evaluate({ filter }, documents)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (collection) {
        await updateSmartCollection(collection.id, { name, filter })
      } else {
        await createSmartCollection(name, filter)
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      title={collection ? 'Edit Smart Collection' : 'Create Smart Collection'}
      onClose={onClose}
      size="medium"
    >
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Chapter 3 Sources"
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Tags</label>
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder="Select tags to filter by..."
          />
          {tags.length > 1 && (
            <div className={styles.modeToggle}>
              <label>
                <input
                  type="radio"
                  checked={tagMode === 'AND'}
                  onChange={() => setTagMode('AND')}
                />
                Match ALL tags (AND)
              </label>
              <label>
                <input
                  type="radio"
                  checked={tagMode === 'OR'}
                  onChange={() => setTagMode('OR')}
                />
                Match ANY tag (OR)
              </label>
            </div>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Additional Filters</label>
          <div className={styles.checkboxGroup}>
            <label>
              <input
                type="checkbox"
                checked={starred === true}
                onChange={e => setStarred(e.target.checked ? true : null)}
              />
              Starred only
            </label>
            <label>
              <input
                type="checkbox"
                checked={read === false}
                onChange={e => setRead(e.target.checked ? false : null)}
              />
              Unread only
            </label>
            <label>
              <input
                type="checkbox"
                checked={read === true}
                onChange={e => setRead(e.target.checked ? true : null)}
              />
              Read only
            </label>
          </div>
        </div>

        <div className={styles.preview}>
          <span className={styles.previewLabel}>Preview:</span>
          <span className={styles.previewCount}>
            {matchingDocIds.length} document{matchingDocIds.length !== 1 ? 's' : ''} match
          </span>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!name.trim() || tags.length === 0 || isSaving}
          >
            {isSaving ? 'Saving...' : (collection ? 'Update' : 'Create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

#### 5. Add smart collections to sidebar

Update `Sidebar.jsx` to show smart collections between Folders and Tags:

```jsx
// Smart Collections section
<div className={styles.section}>
  <div className={styles.sectionHeader}>
    <span>Smart Collections</span>
    <button onClick={() => setShowNewCollectionModal(true)}>+</button>
  </div>
  {smartCollections.map(collection => (
    <button
      key={collection.id}
      className={`${styles.collectionItem} ${selectedCollectionId === collection.id ? styles.selected : ''}`}
      onClick={() => selectSmartCollection(collection.id)}
    >
      <span className={styles.icon}>{collection.icon}</span>
      <span className={styles.name}>{collection.name}</span>
      <span className={styles.count}>
        {smartCollectionService.evaluate(collection, documents).length}
      </span>
    </button>
  ))}
</div>
```

### Part C: Bulk Tag Operations

#### 6. `src/components/library/BulkActionsBar.jsx`

```jsx
import { useState } from 'react'
import { useLibraryStore } from '../../store/libraryStore'
import { Button } from '../ui/Button'
import { BulkTagModal } from './BulkTagModal'
import styles from './BulkActionsBar.module.css'

export function BulkActionsBar() {
  const selectedDocIds = useLibraryStore(s => s.selectedDocIds)
  const clearDocSelection = useLibraryStore(s => s.clearDocSelection)
  const [showAddTagModal, setShowAddTagModal] = useState(false)
  const [showRemoveTagModal, setShowRemoveTagModal] = useState(false)

  if (selectedDocIds.length === 0) return null

  return (
    <>
      <div className={styles.bar}>
        <span className={styles.count}>
          {selectedDocIds.length} document{selectedDocIds.length !== 1 ? 's' : ''} selected
        </span>

        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowAddTagModal(true)}
          >
            Add Tag
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowRemoveTagModal(true)}
          >
            Remove Tag
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={clearDocSelection}
          >
            Clear Selection
          </Button>
        </div>
      </div>

      {showAddTagModal && (
        <BulkTagModal
          mode="add"
          docIds={selectedDocIds}
          onClose={() => setShowAddTagModal(false)}
        />
      )}

      {showRemoveTagModal && (
        <BulkTagModal
          mode="remove"
          docIds={selectedDocIds}
          onClose={() => setShowRemoveTagModal(false)}
        />
      )}
    </>
  )
}
```

#### 7. `src/components/library/BulkTagModal.jsx`

```jsx
import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './BulkTagModal.module.css'

export function BulkTagModal({ mode, docIds, onClose }) {
  const [selectedTag, setSelectedTag] = useState(null)
  const [isApplying, setIsApplying] = useState(false)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const bulkAddTag = useLibraryStore(s => s.bulkAddTag)
  const bulkRemoveTag = useLibraryStore(s => s.bulkRemoveTag)
  const clearDocSelection = useLibraryStore(s => s.clearDocSelection)

  // For remove mode, only show tags that are on at least one selected doc
  const availableTags = useMemo(() => {
    const allTags = tagService.getAllTagsWithCounts(tagRegistry, documents)

    if (mode === 'remove') {
      const tagsOnSelected = new Set()
      for (const docId of docIds) {
        const doc = documents[docId]
        for (const slug of doc?.user_data?.tags || []) {
          tagsOnSelected.add(slug)
        }
      }
      return allTags.filter(t => tagsOnSelected.has(t.slug))
    }

    return allTags
  }, [tagRegistry, documents, docIds, mode])

  const handleApply = async () => {
    if (!selectedTag) return

    setIsApplying(true)
    try {
      if (mode === 'add') {
        await bulkAddTag(selectedTag, docIds)
      } else {
        await bulkRemoveTag(selectedTag, docIds)
      }
      clearDocSelection()
      onClose()
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Modal
      title={mode === 'add' ? 'Add Tag to Documents' : 'Remove Tag from Documents'}
      onClose={onClose}
      size="small"
    >
      <div className={styles.content}>
        <p className={styles.description}>
          {mode === 'add'
            ? `Select a tag to add to ${docIds.length} document${docIds.length !== 1 ? 's' : ''}:`
            : `Select a tag to remove from ${docIds.length} document${docIds.length !== 1 ? 's' : ''}:`
          }
        </p>

        <div className={styles.tagList}>
          {availableTags.map(tag => (
            <button
              key={tag.slug}
              className={`${styles.tagOption} ${selectedTag === tag.slug ? styles.selected : ''}`}
              onClick={() => setSelectedTag(tag.slug)}
            >
              <span
                className={styles.colorDot}
                style={{ backgroundColor: tag.color }}
              />
              <span className={styles.tagName}>{tag.displayName}</span>
            </button>
          ))}

          {availableTags.length === 0 && (
            <p className={styles.empty}>
              {mode === 'remove'
                ? 'Selected documents have no tags to remove.'
                : 'No tags available. Create a tag first.'
              }
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={mode === 'remove' ? 'danger' : 'primary'}
            onClick={handleApply}
            disabled={!selectedTag || isApplying}
          >
            {isApplying
              ? 'Applying...'
              : (mode === 'add' ? 'Add Tag' : 'Remove Tag')
            }
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

#### 8. Add multi-select to DocList/DocCard

```jsx
// In DocCard, add checkbox for selection mode
{selectionMode && (
  <input
    type="checkbox"
    className={styles.selectCheckbox}
    checked={selectedDocIds.includes(doc.id)}
    onChange={() => toggleDocSelection(doc.id)}
    onClick={e => e.stopPropagation()}
  />
)}

// In DocList header, add selection controls
<div className={styles.selectionControls}>
  <button onClick={toggleSelectionMode}>
    {selectionMode ? 'Done' : 'Select'}
  </button>
  {selectionMode && (
    <>
      <button onClick={selectAllVisible}>Select All</button>
      <button onClick={clearDocSelection}>Clear</button>
    </>
  )}
</div>
```

### Part D: Tag Rename & Merge

#### 9. `src/components/tags/TagMergeModal.jsx`

```jsx
import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagMergeModal.module.css'

export function TagMergeModal({ onClose }) {
  const [sourceTags, setSourceTags] = useState([])
  const [targetTag, setTargetTag] = useState(null)
  const [isMerging, setIsMerging] = useState(false)

  const tagRegistry = useLibraryStore(s => s.tagRegistry)
  const documents = useLibraryStore(s => s.documents)
  const mergeTags = useLibraryStore(s => s.mergeTags)

  const tagsWithCounts = useMemo(() =>
    tagService.getAllTagsWithCounts(tagRegistry, documents),
    [tagRegistry, documents]
  )

  // Calculate affected document count
  const affectedCount = useMemo(() => {
    if (sourceTags.length === 0) return 0
    return Object.values(documents).filter(doc => {
      const docTags = doc.user_data?.tags || []
      return sourceTags.some(s => docTags.includes(s))
    }).length
  }, [sourceTags, documents])

  const handleMerge = async () => {
    if (!targetTag || sourceTags.length === 0) return

    setIsMerging(true)
    try {
      await mergeTags(sourceTags, targetTag)
      onClose()
    } finally {
      setIsMerging(false)
    }
  }

  const toggleSource = (slug) => {
    if (slug === targetTag) return // Can't select target as source
    setSourceTags(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug]
    )
  }

  const selectTarget = (slug) => {
    // Remove from sources if it was there
    setSourceTags(prev => prev.filter(s => s !== slug))
    setTargetTag(slug)
  }

  return (
    <Modal title="Merge Tags" onClose={onClose} size="medium">
      <div className={styles.content}>
        <div className={styles.columns}>
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Source Tags (will be deleted)</h4>
            <div className={styles.tagList}>
              {tagsWithCounts.map(tag => (
                <label
                  key={tag.slug}
                  className={`${styles.tagOption} ${tag.slug === targetTag ? styles.disabled : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sourceTags.includes(tag.slug)}
                    onChange={() => toggleSource(tag.slug)}
                    disabled={tag.slug === targetTag}
                  />
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.displayName}</span>
                  <span className={styles.count}>({tag.documentCount})</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.arrow}>→</div>

          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Target Tag (will keep)</h4>
            <div className={styles.tagList}>
              {tagsWithCounts.map(tag => (
                <button
                  key={tag.slug}
                  className={`${styles.targetOption} ${tag.slug === targetTag ? styles.selected : ''} ${sourceTags.includes(tag.slug) ? styles.disabled : ''}`}
                  onClick={() => selectTarget(tag.slug)}
                  disabled={sourceTags.includes(tag.slug)}
                >
                  <span
                    className={styles.colorDot}
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.displayName}</span>
                  <span className={styles.count}>({tag.documentCount})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {sourceTags.length > 0 && targetTag && (
          <div className={styles.preview}>
            <strong>Preview:</strong> {sourceTags.length} tag{sourceTags.length !== 1 ? 's' : ''} will be merged into "{tagRegistry[targetTag]?.displayName}".
            {affectedCount} document{affectedCount !== 1 ? 's' : ''} will be updated.
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleMerge}
            disabled={sourceTags.length === 0 || !targetTag || isMerging}
          >
            {isMerging ? 'Merging...' : 'Merge Tags'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

### Part E: AI Tag Suggestions

#### 10. `src/services/tags/TagSuggestionService.js`

```javascript
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
```

#### 11. Update `MetadataReviewModal.jsx`

Show suggested tags during document upload:

```jsx
import { tagSuggestionService } from '../../services/tags/TagSuggestionService'

// In the modal, after metadata extraction
const [suggestedTags, setSuggestedTags] = useState([])
const [userTags, setUserTags] = useState([])

useEffect(() => {
  // Suggest tags based on document text
  const suggest = async () => {
    if (!extractedText || Object.keys(tagRegistry).length === 0) return

    const suggestions = await tagSuggestionService.suggestTags(
      extractedText,
      tagRegistry,
      aiService
    )
    setSuggestedTags(suggestions)
  }
  suggest()
}, [extractedText, tagRegistry])

// In the JSX
{suggestedTags.length > 0 && (
  <div className={styles.suggestions}>
    <label className={styles.label}>Suggested Tags</label>
    <div className={styles.suggestionChips}>
      {suggestedTags.map(slug => {
        const tag = tagRegistry[slug]
        const isAdded = userTags.includes(slug)
        return (
          <button
            key={slug}
            className={`${styles.suggestionChip} ${isAdded ? styles.added : ''}`}
            onClick={() => {
              if (isAdded) {
                setUserTags(prev => prev.filter(t => t !== slug))
              } else {
                setUserTags(prev => [...prev, slug])
              }
            }}
          >
            <span
              className={styles.colorDot}
              style={{ backgroundColor: tag?.color }}
            />
            {tag?.displayName || slug}
            {isAdded ? ' ✓' : ' +'}
          </button>
        )
      })}
    </div>
  </div>
)}

<div className={styles.field}>
  <label className={styles.label}>Tags</label>
  <TagInput
    tags={userTags}
    onChange={setUserTags}
    placeholder="Add organizational tags..."
  />
</div>
```

---

## Store Updates for Stage 21

Add to `libraryStore.js`:

```javascript
// Smart collections
smartCollections: [],

createSmartCollection: async (name, filter) => {
  const { library, saveLibrary } = get()
  const collection = smartCollectionService.create(name, filter)
  const newCollections = [...(library.smart_collections || []), collection]
  const newLibrary = { ...library, smart_collections: newCollections }
  set({ smartCollections: newCollections, library: newLibrary })
  await saveLibrary()
  return collection
},

updateSmartCollection: async (id, updates) => {
  const { library, smartCollections, saveLibrary } = get()
  const newCollections = smartCollections.map(c =>
    c.id === id ? smartCollectionService.update(c, updates) : c
  )
  const newLibrary = { ...library, smart_collections: newCollections }
  set({ smartCollections: newCollections, library: newLibrary })
  await saveLibrary()
},

deleteSmartCollection: async (id) => {
  const { library, smartCollections, saveLibrary } = get()
  const newCollections = smartCollections.filter(c => c.id !== id)
  const newLibrary = { ...library, smart_collections: newCollections }
  set({ smartCollections: newCollections, library: newLibrary })
  await saveLibrary()
},

selectedCollectionId: null,
selectSmartCollection: (id) => {
  set({ selectedCollectionId: id, selectedFolderId: null, selectedTags: [] })
},

// Bulk operations
selectedDocIds: [],
selectionMode: false,

toggleSelectionMode: () => {
  const { selectionMode } = get()
  set({ selectionMode: !selectionMode, selectedDocIds: [] })
},

toggleDocSelection: (docId) => {
  const { selectedDocIds } = get()
  const newIds = selectedDocIds.includes(docId)
    ? selectedDocIds.filter(id => id !== docId)
    : [...selectedDocIds, docId]
  set({ selectedDocIds: newIds })
},

selectAllVisible: (docIds) => {
  set({ selectedDocIds: docIds })
},

clearDocSelection: () => {
  set({ selectedDocIds: [], selectionMode: false })
},

bulkAddTag: async (slug, docIds) => {
  const { documents, library, saveLibrary } = get()
  const updates = tagService.addTagToDocuments(documents, slug, docIds)

  const newDocuments = { ...documents }
  for (const { docId, newTags } of updates) {
    newDocuments[docId] = {
      ...newDocuments[docId],
      user_data: { ...newDocuments[docId].user_data, tags: newTags }
    }
  }

  const newLibrary = { ...library, documents: newDocuments }
  set({ documents: newDocuments, library: newLibrary })
  await saveLibrary()
},

bulkRemoveTag: async (slug, docIds) => {
  const { documents, library, saveLibrary } = get()
  const updates = tagService.removeTagFromDocuments(documents, slug, docIds)

  const newDocuments = { ...documents }
  for (const { docId, newTags } of updates) {
    newDocuments[docId] = {
      ...newDocuments[docId],
      user_data: { ...newDocuments[docId].user_data, tags: newTags }
    }
  }

  const newLibrary = { ...library, documents: newDocuments }
  set({ documents: newDocuments, library: newLibrary })
  await saveLibrary()
},

mergeTags: async (sourceSlugs, targetSlug) => {
  const { tagRegistry, documents, library, saveLibrary } = get()
  const notes = {} // coordinate with notesStore

  const result = tagService.mergeTags(tagRegistry, documents, notes, sourceSlugs, targetSlug)
  if (result.error) return result

  // Update registry (remove source tags)
  const newRegistry = { ...tagRegistry }
  for (const slug of result.tagsToDelete) {
    delete newRegistry[slug]
  }

  // Update documents
  const newDocuments = { ...documents }
  for (const { docId, newTags } of result.docUpdates) {
    newDocuments[docId] = {
      ...newDocuments[docId],
      user_data: { ...newDocuments[docId].user_data, tags: newTags }
    }
  }

  const newLibrary = {
    ...library,
    tag_registry: newRegistry,
    documents: newDocuments
  }

  set({ tagRegistry: newRegistry, documents: newDocuments, library: newLibrary })
  await saveLibrary()

  return result
},
```

---

## Verification

1. Edit tag color/category via TagEditModal
2. Create a smart collection with multiple tags + starred filter
3. Smart collection shows correct document count
4. Click smart collection to view matching documents
5. Select multiple documents → Add Tag → tag applied to all
6. Merge two tags → source deleted, documents updated
7. Upload document → AI suggests relevant tags
8. Accept/reject suggested tags during upload

## Commit
```bash
git commit -m "feat: smart collections, tag management — colors, bulk ops, merge, AI suggestions"
```

---

## Final Checklist

After completing all 4 stages:

- [ ] Tags have registry with displayName, color, category
- [ ] TagInput provides autocomplete from existing tags
- [ ] Documents can be tagged via DocCard and EditMetadataModal
- [ ] Sidebar shows Tags section with counts
- [ ] Multi-tag filtering with AND/OR
- [ ] Active filters shown as removable chips
- [ ] AI chat supports tag-scoped queries
- [ ] Smart collections saved and evaluated dynamically
- [ ] Bulk tag add/remove operations
- [ ] Tag rename updates all references
- [ ] Tag merge consolidates into target
- [ ] Tag delete removes from all documents/notes
- [ ] AI suggests tags on document upload
