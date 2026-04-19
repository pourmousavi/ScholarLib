/**
 * ImportService - Orchestrate library import workflow
 *
 * Handles the complete import process:
 * 1. Parse source file (Zotero RDF, etc.)
 * 2. Map data to ScholarLib schema
 * 3. Detect duplicates
 * 4. Create folders and tags
 * 5. Import documents
 * 6. Upload PDFs
 * 7. Extract PDF annotations
 */

import { nanoid } from 'nanoid'
import { parseZoteroRDF, convertToScholarLibDocument } from './ZoteroRDFParser'
import { batchFindDuplicates, resolveDuplicate } from './DuplicateDetector'
import { extractPDFAnnotations, extractHighlightedText } from './PDFAnnotationExtractor'
import { AnnotationService } from '../annotations'
import { useLibraryStore } from '../../store/libraryStore'
import { LibraryService } from '../library/LibraryService'
import { tagService } from '../tags/TagService'
import TurndownService from 'turndown'

// Initialize turndown for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

/**
 * Import source types
 */
export const IMPORT_SOURCES = {
  ZOTERO_RDF: 'zotero_rdf',
  BIBTEX: 'bibtex',
  MENDELEY: 'mendeley',
  ENDNOTE: 'endnote'
}

/**
 * Import state machine states
 */
export const IMPORT_STATES = {
  IDLE: 'idle',
  PARSING: 'parsing',
  SCANNING: 'scanning',
  MAPPING: 'mapping',
  DETECTING_DUPLICATES: 'detecting_duplicates',
  READY: 'ready',
  IMPORTING: 'importing',
  COMPLETE: 'complete',
  ERROR: 'error'
}

/**
 * Parse import file based on source type
 * @param {string} sourceType - One of IMPORT_SOURCES
 * @param {string} fileContent - Raw file content
 * @returns {Object} Parsed data
 */
export async function parseImportFile(sourceType, fileContent) {
  switch (sourceType) {
    case IMPORT_SOURCES.ZOTERO_RDF:
      return parseZoteroRDF(fileContent)

    case IMPORT_SOURCES.BIBTEX:
      // TODO: Implement BibTeX parser
      throw new Error('BibTeX import not yet implemented')

    case IMPORT_SOURCES.MENDELEY:
      // TODO: Implement Mendeley parser
      throw new Error('Mendeley import not yet implemented')

    case IMPORT_SOURCES.ENDNOTE:
      // TODO: Implement EndNote parser
      throw new Error('EndNote import not yet implemented')

    default:
      throw new Error(`Unknown import source: ${sourceType}`)
  }
}

/**
 * Create folder structure from parsed collections
 * @param {Array} collections - Parsed collections
 * @param {string} rootFolderId - ID of root folder to import into
 * @returns {Object} Mapping of collection ID to folder ID
 */
export function createFolderMapping(collections, rootFolderId) {
  const mapping = {}
  const { folders, addFolder, updateFolder } = useLibraryStore.getState()

  // Sort collections by depth (parents before children)
  const sorted = sortCollectionsByDepth(collections)

  // Keep track of newly created folders so we can update their children
  const createdFolders = {}

  for (const collection of sorted) {
    // Determine parent folder ID
    // Use null for root level (rootFolderId === 'root' means no parent)
    const parentFolderId = collection.parentId
      ? mapping[collection.parentId]
      : (rootFolderId === 'root' ? null : rootFolderId)

    // Get current folders (need fresh state as we're adding)
    const currentFolders = useLibraryStore.getState().folders

    // Check if folder with same name already exists in parent
    const existingFolder = currentFolders.find(
      f => f.name === collection.name && f.parent_id === parentFolderId
    )

    if (existingFolder) {
      mapping[collection.id] = existingFolder.id
    } else {
      // Create new folder object
      const folderId = `f_${nanoid(10)}`
      const newFolder = {
        id: folderId,
        name: collection.name,
        slug: collection.name.toLowerCase().replace(/\s+/g, '-'),
        parent_id: parentFolderId,
        children: [],
        created_at: new Date().toISOString(),
        shared_with: [],
        color: null,
        icon: null,
        sort_order: currentFolders.filter(f => f.parent_id === parentFolderId).length
      }

      // Add to store
      addFolder(newFolder)
      createdFolders[folderId] = newFolder
      mapping[collection.id] = folderId

      // Update parent folder's children array
      if (parentFolderId) {
        const parentFolder = currentFolders.find(f => f.id === parentFolderId)
        if (parentFolder) {
          updateFolder(parentFolderId, {
            children: [...(parentFolder.children || []), folderId]
          })
        } else if (createdFolders[parentFolderId]) {
          // Parent was just created in this session
          createdFolders[parentFolderId].children.push(folderId)
          updateFolder(parentFolderId, {
            children: createdFolders[parentFolderId].children
          })
        }
      }
    }
  }

  return mapping
}

/**
 * Sort collections by depth for proper hierarchy creation
 * @param {Array} collections
 * @returns {Array}
 */
function sortCollectionsByDepth(collections) {
  // Build parent-child relationships
  const byId = {}
  for (const coll of collections) {
    byId[coll.id] = coll
  }

  // Calculate depth for each collection
  const depths = {}
  function getDepth(id) {
    if (depths[id] !== undefined) return depths[id]
    const coll = byId[id]
    if (!coll || !coll.parentId || !byId[coll.parentId]) {
      depths[id] = 0
    } else {
      depths[id] = getDepth(coll.parentId) + 1
    }
    return depths[id]
  }

  for (const coll of collections) {
    getDepth(coll.id)
  }

  // Sort by depth (shallowest first)
  return [...collections].sort((a, b) => depths[a.id] - depths[b.id])
}

/**
 * Create/register tags from import
 * @param {Array} tags - Array of tag strings
 * @returns {Object} Mapping of tag string to tag slug
 */
export function createTagMapping(tags) {
  const mapping = {}
  const { tagRegistry, createTag } = useLibraryStore.getState()

  for (const tagName of tags) {
    // Check if tag already exists
    const slug = tagService.slugify(tagName)
    const existing = tagRegistry[slug]

    if (existing) {
      mapping[tagName] = slug
    } else {
      // Create new tag
      createTag(tagName)
      mapping[tagName] = slug
    }
  }

  return mapping
}

/**
 * Convert HTML notes to Markdown
 * @param {string} htmlContent - HTML content
 * @returns {string} Markdown content
 */
export function convertNoteToMarkdown(htmlContent) {
  if (!htmlContent) return ''

  try {
    // Clean up Zotero-specific HTML
    let cleaned = htmlContent
      // Remove Zotero div wrappers
      .replace(/<div[^>]*data-schema-version[^>]*>/g, '')
      .replace(/<\/div>/g, '\n')
      // Fix common issues
      .replace(/&nbsp;/g, ' ')

    return turndown.turndown(cleaned).trim()
  } catch (error) {
    console.error('Failed to convert note:', error)
    return htmlContent
  }
}

/**
 * Build file lookup maps for fast O(1) attachment matching
 * @param {FileList} attachmentsFolder
 * @returns {Object} Maps for different matching strategies
 */
function buildFileLookupMaps(attachmentsFolder) {
  if (!(attachmentsFolder instanceof FileList)) {
    return null
  }

  const byExactName = new Map()
  const byLowerName = new Map()
  const byPathParts = new Map()

  for (const file of attachmentsFolder) {
    if (!file.name.toLowerCase().endsWith('.pdf')) continue

    const exactName = file.name
    const lowerName = file.name.toLowerCase()
    const relativePath = file.webkitRelativePath || file.name

    // Store by exact filename
    if (!byExactName.has(exactName)) {
      byExactName.set(exactName, file)
    }

    // Store by lowercase filename
    if (!byLowerName.has(lowerName)) {
      byLowerName.set(lowerName, file)
    }

    // Store by last two path parts (for Zotero storage structure)
    const pathParts = relativePath.replace(/\\/g, '/').split('/')
    const lastTwoParts = pathParts.slice(-2).join('/').toLowerCase()
    if (!byPathParts.has(lastTwoParts)) {
      byPathParts.set(lastTwoParts, file)
    }
  }

  return { byExactName, byLowerName, byPathParts }
}

/**
 * Import documents from parsed data
 * @param {Object} parsedData - Parsed import data
 * @param {Object} options - Import options
 * @param {Function} onProgress - Progress callback
 * @param {AbortSignal} signal - Optional AbortSignal for cancellation
 * @param {Function} onCheckpoint - Callback called after checkpoint saves
 * @returns {Promise<Object>} Import results
 */
export async function importDocuments(parsedData, options, onProgress, signal, onCheckpoint) {
  const {
    adapter,
    folderMapping,
    tagMapping,
    duplicateResolutions,
    attachmentsFolder, // Path to folder containing PDFs
    extractAnnotations = true,
    importNotes = true,
    startIndex = 0 // Support resuming from a specific index
  } = options

  const results = {
    imported: [],
    skipped: [],
    failed: [],
    annotationsExtracted: 0,
    notesImported: 0,
    cancelled: false,
    lastCompletedIndex: startIndex - 1
  }

  const { addDocument, documents } = useLibraryStore.getState()
  const total = parsedData.items.length

  // Pre-build file lookup maps for O(1) matching (instead of O(n) per document)
  const fileLookupMaps = buildFileLookupMaps(attachmentsFolder)

  // Log diagnostic info about attachments folder
  if (attachmentsFolder instanceof FileList) {
    const pdfCount = fileLookupMaps?.byExactName?.size || 0
    console.log('[ImportService] Attachments folder diagnostic:', {
      totalFiles: attachmentsFolder.length,
      pdfCount,
      hasWebkitRelativePath: attachmentsFolder[0]?.webkitRelativePath ? true : false,
      samplePath: attachmentsFolder[0]?.webkitRelativePath || attachmentsFolder[0]?.name
    })
  }

  // Send initial progress update
  onProgress?.({
    stage: 'importing',
    current: startIndex,
    total,
    item: startIndex > 0 ? 'Resuming import...' : 'Starting import...'
  })

  for (let i = startIndex; i < parsedData.items.length; i++) {
    // Check for cancellation before processing each item
    if (signal?.aborted) {
      results.cancelled = true
      // Save library before returning
      try {
        const library = useLibraryStore.getState().getLibrarySnapshot()
        await LibraryService.saveLibrary(adapter, library)
      } catch (saveError) {
        console.error('Failed to save library on cancellation:', saveError)
      }
      return results
    }
    const item = parsedData.items[i]
    onProgress?.({
      stage: 'importing',
      current: i + 1,
      total,
      item: item.title
    })

    try {
      // Check for duplicate resolution
      // Resolution can be either a string ('skip') or object ({ action: 'skip' })
      const duplicateKey = `${i}`
      const resolution = duplicateResolutions?.[duplicateKey]
      const resolutionAction = typeof resolution === 'string' ? resolution : resolution?.action

      if (resolutionAction === 'skip') {
        results.skipped.push({
          title: item.title,
          reason: 'User chose to skip duplicate'
        })
        continue
      }

      // Determine target folder
      // Note: defaultFolderId of 'root' means no folder (null)
      const defaultFolder = options.defaultFolderId === 'root' ? null : options.defaultFolderId
      const folderId = item.collections.length > 0
        ? folderMapping[item.collections[0]] || defaultFolder
        : defaultFolder

      // Convert to ScholarLib document
      let doc = convertToScholarLibDocument(item, folderId)
      const docId = `d_${nanoid(10)}`
      doc.id = docId

      // Map tags
      if (item.tags && tagMapping) {
        doc.user_data.tags = item.tags
          .map(tag => tagMapping[tag])
          .filter(Boolean)
      }

      // Handle duplicate resolution (replace or merge)
      if (resolution && resolutionAction && resolutionAction !== 'skip' && resolutionAction !== 'keep_both') {
        const existingDocId = typeof resolution === 'object' ? resolution.existingDocId : null
        if (existingDocId && documents[existingDocId]) {
          doc = resolveDuplicate(documents[existingDocId], doc, resolutionAction)
          doc.id = existingDocId // Keep existing ID
        }
      }

      // Find and upload PDF attachment
      // Try multiple matching strategies for finding the attachment
      let attachment = parsedData.attachments.find(
        a => a.parentItemId === item.id && a.mimeType === 'application/pdf'
      )

      // If no exact match, try matching by item's attachment IDs
      if (!attachment && item.attachmentIds?.length > 0) {
        attachment = parsedData.attachments.find(
          a => item.attachmentIds.includes(a.id) && a.mimeType === 'application/pdf'
        )
      }

      // If still no match, try finding any PDF attachment linked to this item
      if (!attachment) {
        attachment = parsedData.attachments.find(
          a => a.parentItemId === item.id && (
            a.mimeType === 'application/pdf' ||
            a.path?.toLowerCase().endsWith('.pdf') ||
            a.title?.toLowerCase().endsWith('.pdf')
          )
        )
      }

      console.log('[ImportService] Processing item:', {
        title: item.title,
        itemId: item.id,
        attachmentIds: item.attachmentIds,
        foundAttachment: attachment ? {
          id: attachment.id,
          path: attachment.path,
          mimeType: attachment.mimeType,
          parentItemId: attachment.parentItemId
        } : null,
        totalAttachments: parsedData.attachments.length,
        hasAttachmentsFolder: !!attachmentsFolder
      })

      if (attachment && attachmentsFolder) {
        try {
          // Read PDF from attachments folder
          // Pass path, attachment title, and document title for multiple matching strategies
          const pdfFile = await findAttachmentFile(attachmentsFolder, attachment.path, attachment.title, item.title, fileLookupMaps)

          if (pdfFile) {
            // Upload to storage
            const filename = sanitizeFilename(item.title || 'document') + '.pdf'
            const storagePath = `PDFs/${filename}`

            await adapter.uploadFile(storagePath, pdfFile)

            doc.filename = filename
            doc.box_path = storagePath
            doc.box_file_id = storagePath // Will be updated with actual ID

            // Extract annotations if requested
            if (extractAnnotations) {
              try {
                let annotations = await extractPDFAnnotations(pdfFile, (page, total) => {
                  onProgress?.({
                    stage: 'extracting_annotations',
                    current: i + 1,
                    total,
                    page,
                    totalPages: total,
                    item: item.title
                  })
                })

                // Try to extract highlighted text
                annotations = await extractHighlightedText(pdfFile, annotations)

                if (annotations.length > 0) {
                  // Import annotations
                  await AnnotationService.importAnnotations(adapter, docId, annotations)
                  results.annotationsExtracted += annotations.length
                }
              } catch (annError) {
                console.error('Failed to extract annotations:', annError)
              }
            }
          }
        } catch (uploadError) {
          console.error('Failed to upload PDF:', uploadError)
          doc.upload_error = uploadError.message
        }
      }

      // Import notes if requested
      if (importNotes) {
        const itemNotes = parsedData.notes.filter(n => n.parentItemId === item.id)
        for (const note of itemNotes) {
          try {
            const markdownContent = convertNoteToMarkdown(note.content)
            // Notes will be imported through NotesService
            // For now, store in document metadata
            if (!doc.imported_notes) doc.imported_notes = []
            doc.imported_notes.push({
              content: markdownContent,
              imported_at: new Date().toISOString()
            })
            results.notesImported++
          } catch (noteError) {
            console.error('Failed to import note:', noteError)
          }
        }
      }

      // Create document in store
      if (resolutionAction === 'replace' || resolutionAction === 'merge_metadata') {
        // Update existing document
        useLibraryStore.getState().updateDocument(doc.id, doc)
      } else {
        // Add new document to store
        addDocument(doc)
      }

      results.imported.push({
        id: doc.id,
        title: doc.metadata.title
      })

      // Update last completed index
      results.lastCompletedIndex = i

      // Checkpoint: save library every 10 items
      if (results.imported.length % 10 === 0) {
        try {
          const library = useLibraryStore.getState().getLibrarySnapshot()
          await LibraryService.saveLibrary(adapter, library)
          onCheckpoint?.({ lastCompletedIndex: i, results: { ...results } })
        } catch (saveError) {
          console.error('Failed to save checkpoint:', saveError)
        }
      }

    } catch (error) {
      console.error('Failed to import item:', error)
      results.failed.push({
        title: item.title,
        error: error.message
      })
    }
  }

  // Save library
  try {
    const library = useLibraryStore.getState().getLibrarySnapshot()
    await LibraryService.saveLibrary(adapter, library)
  } catch (saveError) {
    console.error('Failed to save library after import:', saveError)
  }

  onProgress?.({
    stage: 'complete',
    results
  })

  return results
}

/**
 * Find attachment file in attachments folder
 * @param {FileList|Object} attachmentsFolder - Folder containing attachments
 * @param {string} path - Relative path to file from Zotero
 * @param {string} attachmentTitle - Attachment title (used as fallback for matching)
 * @param {string} documentTitle - Document/item title (used for title-based matching)
 * @param {Object} lookupMaps - Pre-built lookup maps for O(1) matching
 * @returns {Promise<File|Blob|null>}
 */
async function findAttachmentFile(attachmentsFolder, path, attachmentTitle, documentTitle, lookupMaps) {
  // Use attachment title as fallback if path is null and title looks like a filename
  let effectivePath = path
  if (!effectivePath && attachmentTitle?.toLowerCase().endsWith('.pdf')) {
    effectivePath = attachmentTitle
  }

  // If still no path, try to construct one from document title
  if (!effectivePath && documentTitle) {
    effectivePath = documentTitle.replace(/[<>:"/\\|?*]/g, '').substring(0, 100) + '.pdf'
  }

  if (!effectivePath) return null

  // Normalize the path from Zotero
  // Zotero paths can be:
  // - "attachments:filename.pdf" (Zotero internal format)
  // - "storage/XXXXXXXX/filename.pdf" (relative to Zotero data dir)
  // - Just "filename.pdf"
  // - Full absolute paths
  let normalizedPath = effectivePath

  // Strip "attachments:" prefix if present
  if (normalizedPath.startsWith('attachments:')) {
    normalizedPath = normalizedPath.substring('attachments:'.length)
  }

  // Extract just the filename for matching
  const filename = normalizedPath.split('/').pop().split('\\').pop()

  // Also try to get a subfolder/filename pattern for better matching
  const pathParts = normalizedPath.replace(/\\/g, '/').split('/')
  const lastTwoParts = pathParts.slice(-2).join('/').toLowerCase()

  // Handle FileList (from file input with webkitdirectory)
  if (attachmentsFolder instanceof FileList && lookupMaps) {
    const { byExactName, byLowerName, byPathParts } = lookupMaps

    // O(1) lookups using pre-built maps
    // 1. Exact filename match
    if (byExactName.has(filename)) {
      return byExactName.get(filename)
    }

    // 2. Case-insensitive filename match
    const lowerFilename = filename.toLowerCase()
    if (byLowerName.has(lowerFilename)) {
      return byLowerName.get(lowerFilename)
    }

    // 3. Path parts match (for Zotero storage structure)
    if (lastTwoParts && byPathParts.has(lastTwoParts)) {
      return byPathParts.get(lastTwoParts)
    }

    // Fallback to slower fuzzy matching for edge cases
    // These are still needed for cases where filenames were renamed

    // Fuzzy match on title-like filenames
    const cleanFilename = filename
      .replace(/\.pdf$/i, '')
      .replace(/[-_]/g, ' ')
      .toLowerCase()

    if (cleanFilename.length > 10) {
      const prefix = cleanFilename.substring(0, 20)
      for (const [lowerName, file] of byLowerName) {
        const cleanName = lowerName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ')
        if (cleanName.includes(prefix)) {
          return file
        }
      }
    }

    // Match by significant words in the filename
    const filenameWords = cleanFilename
      .split(/[\s\-_.,()]+/)
      .filter(w => w.length > 3)
      .slice(0, 5)

    if (filenameWords.length >= 2) {
      for (const [lowerName, file] of byLowerName) {
        const cleanName = lowerName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ')
        const matchCount = filenameWords.filter(w => cleanName.includes(w)).length
        if (matchCount >= Math.ceil(filenameWords.length / 2) && matchCount >= 2) {
          return file
        }
      }
    }

    // Match by document title words
    if (documentTitle) {
      const titleWords = documentTitle
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 6)

      if (titleWords.length >= 2) {
        for (const [lowerName, file] of byLowerName) {
          const cleanName = lowerName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ')
          const matchCount = titleWords.filter(w => cleanName.includes(w)).length
          if (matchCount >= Math.ceil(titleWords.length / 2) && matchCount >= 2) {
            return file
          }
        }
      }
    }
  }

  // Handle File object
  if (attachmentsFolder instanceof File) {
    return attachmentsFolder
  }

  return null
}

/**
 * Sanitize filename for storage
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100)
}

/**
 * Get import statistics from parsed data
 * @param {Object} parsedData
 * @param {Object} existingDocs
 * @returns {Object}
 */
export function getImportStats(parsedData, existingDocs) {
  const duplicates = batchFindDuplicates(
    parsedData.items.map(item => convertToScholarLibDocument(item, '')),
    existingDocs
  )

  return {
    totalItems: parsedData.items.length,
    totalCollections: parsedData.collections.length,
    totalTags: parsedData.tags.length,
    totalAttachments: parsedData.attachments.length,
    totalNotes: parsedData.notes.length,
    duplicateCount: duplicates.size,
    duplicates: Array.from(duplicates.entries()).map(([index, matches]) => ({
      index,
      item: parsedData.items[index],
      matches
    }))
  }
}
