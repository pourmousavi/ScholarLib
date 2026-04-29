/**
 * Render an author entry to a readable string. The library has accumulated
 * several author shapes over the years — different metadata services normalise
 * differently, and imports from Zotero / CrossRef / OpenAlex / GROBID produce
 * variations like { first, last }, { given, family }, { firstName, lastName },
 * { name: "Full Name" }, or a bare string. The wiki proposal review and any
 * future "Author entries" surface should use this helper rather than reaching
 * for one specific key.
 *
 * Falls back to a JSON dump only if the object truly has nothing recognisable,
 * so the user always sees *something* instead of an empty bullet.
 */
export function authorDisplay(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return entry.trim()
  if (typeof entry !== 'object') return String(entry)

  if (typeof entry.full_name === 'string' && entry.full_name.trim()) return entry.full_name.trim()

  const first = pick(entry, ['first', 'given', 'firstName', 'first_name', 'givenName'])
  const last = pick(entry, ['last', 'family', 'lastName', 'last_name', 'familyName', 'surname'])
  const combined = `${first || ''} ${last || ''}`.trim()
  if (combined) return combined

  if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim()
  if (typeof entry.display === 'string' && entry.display.trim()) return entry.display.trim()
  if (typeof entry.label === 'string' && entry.label.trim()) return entry.label.trim()

  return JSON.stringify(entry)
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
