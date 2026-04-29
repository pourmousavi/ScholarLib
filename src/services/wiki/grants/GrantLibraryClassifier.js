export function isGrantFolder(folder) {
  return folder?.kind === 'grant' || folder?.wiki_type === 'grant' || folder?.user_data?.wiki_type === 'grant'
}

export function getFolderAncestors(folderId, folders = []) {
  const byId = new Map(folders.map(folder => [folder.id, folder]))
  const ancestors = []
  const seen = new Set()
  let current = byId.get(folderId)

  while (current && !seen.has(current.id)) {
    ancestors.push(current)
    seen.add(current.id)
    current = current.parent_id ? byId.get(current.parent_id) : null
  }

  return ancestors
}

export function isInGrantFolder(folderId, folders = []) {
  return getFolderAncestors(folderId, folders).some(isGrantFolder)
}

export function isGrantDocument(document, folders = []) {
  if (!document) return false
  return (
    document.reference_type === 'grant' ||
    document.wiki_type === 'grant' ||
    document.user_data?.wiki_type === 'grant' ||
    isInGrantFolder(document.folder_id, folders)
  )
}

export function getUningestedGrantDocuments(documents = {}, folders = []) {
  return Object.values(documents)
    .filter(document => isGrantDocument(document, folders))
    .filter(document => !document.wiki?.grant_page_id)
    .sort((a, b) => {
      const left = a.metadata?.title || a.filename || a.id
      const right = b.metadata?.title || b.filename || b.id
      return left.localeCompare(right)
    })
}
