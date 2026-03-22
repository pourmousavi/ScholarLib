/**
 * PDFRelinkService - Scans storage for PDFs and relinks document paths
 *
 * After migrating PDFs manually to a new storage provider, this service
 * scans the PDFs folder structure and matches files by filename to update
 * document paths in the library.
 */

class PDFRelinkService {
  /**
   * Scan storage for all PDFs and build a filename index
   * @param {object} adapter - Storage adapter
   * @param {function} onProgress - Progress callback (current, total, message)
   * @returns {Promise<Map>} Map of filename -> { path, found: true }
   */
  async scanForPDFs(adapter, onProgress = () => {}) {
    const pdfIndex = new Map()

    onProgress(0, 0, 'Starting scan...')

    try {
      // List all files in PDFs folder recursively
      const files = await this._listPDFsRecursively(adapter, 'PDFs', onProgress)

      for (const file of files) {
        const filename = file.name.toLowerCase()
        const existing = pdfIndex.get(filename)

        if (existing) {
          // Multiple files with same name - track all paths
          if (!existing.paths) {
            existing.paths = [existing.path]
          }
          existing.paths.push(file.path)
        } else {
          pdfIndex.set(filename, {
            path: file.path,
            name: file.name,
            found: true
          })
        }
      }

      onProgress(files.length, files.length, `Found ${files.length} PDFs`)
    } catch (error) {
      console.error('PDF scan error:', error)
      throw error
    }

    return pdfIndex
  }

  /**
   * Match documents from bundle to found PDFs
   * @param {object} bundle - Import bundle
   * @param {Map} pdfIndex - Scanned PDF index
   * @returns {object} { matched: [], missing: [], duplicates: [] }
   */
  matchDocuments(bundle, pdfIndex) {
    const matched = []
    const missing = []
    const duplicates = []

    const documents = bundle.library?.documents || {}
    const manifest = bundle.file_manifest || {}

    for (const [docId, doc] of Object.entries(documents)) {
      const manifestEntry = manifest[docId]
      const filename = (doc.filename || manifestEntry?.filename || '').toLowerCase()

      if (!filename) {
        missing.push({
          docId,
          title: doc.metadata?.title || 'Unknown',
          filename: doc.filename,
          reason: 'No filename'
        })
        continue
      }

      const found = pdfIndex.get(filename)

      if (!found) {
        missing.push({
          docId,
          title: doc.metadata?.title || 'Unknown',
          filename: doc.filename,
          reason: 'File not found'
        })
      } else if (found.paths && found.paths.length > 1) {
        // Multiple matches - try to pick best one based on original path
        const originalPath = manifestEntry?.original_path || doc.box_path

        const bestMatch = this._findBestPathMatch(found.paths, originalPath)

        duplicates.push({
          docId,
          title: doc.metadata?.title || 'Unknown',
          filename: doc.filename,
          paths: found.paths,
          selectedPath: bestMatch,
          originalPath
        })

        matched.push({
          docId,
          title: doc.metadata?.title || 'Unknown',
          filename: doc.filename,
          oldPath: originalPath,
          newPath: bestMatch,
          needsReview: true
        })
      } else {
        matched.push({
          docId,
          title: doc.metadata?.title || 'Unknown',
          filename: doc.filename,
          oldPath: manifestEntry?.original_path || doc.box_path,
          newPath: found.path,
          needsReview: false
        })
      }
    }

    return { matched, missing, duplicates }
  }

  /**
   * Apply path updates to bundle documents
   * @param {object} bundle - Import bundle
   * @param {array} matched - Matched documents with newPath
   * @returns {object} Updated bundle
   */
  applyPathUpdates(bundle, matched) {
    const updatedBundle = JSON.parse(JSON.stringify(bundle))

    for (const match of matched) {
      const doc = updatedBundle.library.documents[match.docId]
      if (doc) {
        doc.box_path = match.newPath
        // Clear the file ID since it's no longer valid
        doc.box_file_id = null
        // Mark index as needing rebuild
        if (doc.index_status) {
          doc.index_status.status = 'pending'
          doc.index_status.indexed_at = null
        }
      }
    }

    return updatedBundle
  }

  /**
   * List PDFs recursively from a folder
   * @private
   */
  async _listPDFsRecursively(adapter, folderPath, onProgress) {
    const allFiles = []
    // Store folder path along with the folder name for building full paths
    const foldersToProcess = [{ path: folderPath }]
    let processed = 0

    while (foldersToProcess.length > 0) {
      const current = foldersToProcess.shift()
      const currentPath = current.path

      try {
        const items = await adapter.listFolder(currentPath)

        for (const item of items) {
          // Build the full path by combining current path and item name
          const itemPath = `${currentPath}/${item.name}`

          if (item.type === 'folder') {
            foldersToProcess.push({ path: itemPath })
          } else if (item.name.toLowerCase().endsWith('.pdf')) {
            allFiles.push({
              name: item.name,
              path: itemPath
            })
          }
        }

        processed++
        onProgress(processed, processed + foldersToProcess.length, `Scanning ${currentPath}...`)
      } catch (error) {
        // Folder might not exist, skip it
        console.warn(`Could not list folder ${currentPath}:`, error)
      }
    }

    return allFiles
  }

  /**
   * Find the best matching path when multiple files have same name
   * @private
   */
  _findBestPathMatch(paths, originalPath) {
    if (!originalPath) {
      return paths[0]
    }

    // Normalize paths for comparison
    const normalizedOriginal = originalPath.toLowerCase().replace(/\\/g, '/')

    // Try to find path with most similar structure
    let bestMatch = paths[0]
    let bestScore = 0

    for (const path of paths) {
      const normalizedPath = path.toLowerCase().replace(/\\/g, '/')
      const score = this._pathSimilarity(normalizedOriginal, normalizedPath)

      if (score > bestScore) {
        bestScore = score
        bestMatch = path
      }
    }

    return bestMatch
  }

  /**
   * Calculate similarity between two paths
   * @private
   */
  _pathSimilarity(path1, path2) {
    const parts1 = path1.split('/').filter(Boolean)
    const parts2 = path2.split('/').filter(Boolean)

    let score = 0

    // Compare from the end (filename and folders)
    const minLength = Math.min(parts1.length, parts2.length)
    for (let i = 0; i < minLength; i++) {
      if (parts1[parts1.length - 1 - i] === parts2[parts2.length - 1 - i]) {
        score += (minLength - i) // Weight closer parts more
      }
    }

    return score
  }
}

export const pdfRelinkService = new PDFRelinkService()
