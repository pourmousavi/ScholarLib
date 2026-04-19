export function needsEnrichment(doc) {
  if (!doc.metadata?.doi) return false
  const m = doc.metadata
  return !m.volume || !m.issue || !m.pages || !m.authors?.length
    || (m.authors?.length > 0 && typeof m.authors[0] === 'string')
}
