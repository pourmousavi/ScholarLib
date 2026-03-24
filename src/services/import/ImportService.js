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
  const { folders, addFolder } = useLibraryStore.getState()

  // Sort collections by depth (parents before children)
  const sorted = sortCollectionsByDepth(collections)

  for (const collection of sorted) {
    // Determine parent folder ID
    // Use null for root level (rootFolderId === 'root' means no parent)
    const parentFolderId = collection.parentId
      ? mapping[collection.parentId]
      : (rootFolderId === 'root' ? null : rootFolderId)

    // Check if folder with same name already exists in parent
    // folders is an array, not an object
    const existingFolder = folders.find(
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
        sort_order: folders.filter(f => f.parent_id === parentFolderId).length
      }

      // Add to store
      addFolder(newFolder)
      mapping[collection.id] = folderId
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
 * Import documents from parsed data
 * @param {Object} parsedData - Parsed import data
 * @param {Object} options - Import options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Import results
 */
export async function importDocuments(parsedData, options, onProgress) {
  const {
    adapter,
    folderMapping,
    tagMapping,
    duplicateResolutions,
    attachmentsFolder, // Path to folder containing PDFs
    extractAnnotations = true,
    importNotes = true
  } = options

  const results = {
    imported: [],
    skipped: [],
    failed: [],
    annotationsExtracted: 0,
    notesImported: 0
  }

  const { createDocument, documents } = useLibraryStore.getState()
  const total = parsedData.items.length

  // Send initial progress update
  onProgress?.({
    stage: 'importing',
    current: 0,
    total,
    item: 'Starting import...'
  })

  for (let i = 0; i < parsedData.items.length; i++) {
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
      const folderId = item.collections.length > 0
        ? folderMapping[item.collections[0]] || options.defaultFolderId
        : options.defaultFolderId

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
      const attachment = parsedData.attachments.find(
        a => a.parentItemId === item.id && a.mimeType === 'application/pdf'
      )

      if (attachment && attachmentsFolder) {
        try {
          // Read PDF from attachments folder
          const pdfFile = await findAttachmentFile(attachmentsFolder, attachment.path)

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
        // Create new document
        createDocument(doc.folder_id, doc)
      }

      results.imported.push({
        id: doc.id,
        title: doc.metadata.title
      })

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
    const { folders, documents: updatedDocs } = useLibraryStore.getState()
    await LibraryService.saveLibrary(adapter, {
      version: '1.0',
      last_modified: new Date().toISOString(),
      folders,
      documents: updatedDocs
    })
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
 * @param {string} path - Relative path to file
 * @returns {Promise<File|Blob|null>}
 */
async function findAttachmentFile(attachmentsFolder, path) {
  if (!path) return null

  // Handle FileList (from file input with webkitdirectory)
  if (attachmentsFolder instanceof FileList) {
    const filename = path.split('/').pop()

    for (const file of attachmentsFolder) {
      if (file.name === filename || file.webkitRelativePath?.endsWith(filename)) {
        return file
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
