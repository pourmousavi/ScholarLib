import { useState, useRef, useEffect, useCallback } from 'react'
import Tag from './Tag'
import { useLibraryStore } from '../../store/libraryStore'
import { tagService } from '../../services/tags/TagService'
import styles from './TagInput.module.css'

/**
 * TagInput - A reusable component for adding/removing tags with autocomplete
 *
 * @param {string[]} tags - Array of tag slugs
 * @param {function} onChange - Callback when tags change: (newTags: string[]) => void
 * @param {string} placeholder - Placeholder text
 * @param {number} maxTags - Maximum number of tags allowed
 * @param {boolean} disabled - Whether the input is disabled
 * @param {boolean} autoFocus - Whether to auto-focus the input
 */
export default function TagInput({
  tags = [],
  onChange,
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

  // Get suggestions: when empty, show full registry alphabetically (browse).
  // When typing, fall back to fuzzy search.
  const trimmed = input.trim()
  const baseSuggestions = trimmed
    ? tagService.searchTags(tagRegistry, input)
    : Object.entries(tagRegistry)
        .map(([slug, tag]) => ({ slug, ...tag }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

  const suggestions = baseSuggestions
    .filter(t => !tags.includes(t.slug)) // Exclude already-added tags
    .slice(0, trimmed ? 8 : 50)

  // Get display names for current tags
  const getDisplayName = (slug) => {
    return tagRegistry[slug]?.displayName || slug
  }

  // Get color for a tag
  const getColor = (slug) => {
    return tagRegistry[slug]?.color
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
    } else if (e.key === 'Tab' && showSuggestions && suggestions.length > 0) {
      e.preventDefault()
      addTag(suggestions[selectedIndex].slug)
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

  // Check if input would create a new tag
  const isNewTag = input.trim() &&
    !suggestions.find(s => s.displayName.toLowerCase() === input.trim().toLowerCase()) &&
    !suggestions.find(s => s.slug === tagService.slugify(input.trim()))

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={`${styles.tagsWrapper} ${disabled ? styles.disabled : ''}`}>
        {tags.map(slug => (
          <Tag
            key={slug}
            label={getDisplayName(slug)}
            color={getColor(slug)}
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
          onFocus={() => setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled || tags.length >= maxTags}
          autoFocus={autoFocus}
        />
      </div>

      {showSuggestions && (suggestions.length > 0 || isNewTag) && (
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
          {isNewTag && (
            <button
              className={`${styles.suggestion} ${styles.createNew} ${suggestions.length === 0 ? styles.selected : ''}`}
              onClick={() => addTag(input.trim())}
            >
              <span className={styles.plusIcon}>+</span>
              <span>Create "{input.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
