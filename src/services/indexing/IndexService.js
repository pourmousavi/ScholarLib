/**
 * IndexService - RAG indexing pipeline
 *
 * Handles PDF text extraction, chunking, embedding, and vector search
 */
import * as pdfjsLib from 'pdfjs-dist'
import { textChunker } from './TextChunker'
import { embeddingService } from './EmbeddingService'
import { useLibraryStore } from '../../store/libraryStore'
import { LibraryService } from '../library/LibraryService'
import { collectionService } from '../tags/CollectionService'
import { AnnotationService } from '../annotations'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`

class IndexService {
  constructor() {
    this.indexCache = null
    this.chunkTextCache = null
    this.onProgress = null
  }

  /**
   * Create empty index metadata
   * @returns {Object}
   */
  createEmptyMeta() {
    return {
      version: 'v1',
      embedding_model: 'nomic-embed-text',
      embedding_dimensions: embeddingService.getDimensions(),
      total_chunks: 0,
      total_docs_indexed: 0,
      last_updated: new Date().toISOString(),
      docs: {}
    }
  }

  /**
   * Load index from storage
   * @param {StorageAdapter} adapter
   * @returns {Promise<{indexData: number[][], meta: Object}>}
   */
  async loadIndex(adapter) {
    // Return cache if available
    if (this.indexCache) {
      return this.indexCache
    }

    try {
      const [binaryBlob, meta] = await Promise.all([
        adapter.downloadFile('_system/index/embeddings_v1.bin'),
        adapter.readJSON('_system/index/index_meta.json')
      ])

      const arrayBuffer = await binaryBlob.arrayBuffer()
      const arr = new Float32Array(arrayBuffer)
      const vectors = []

      // Parse vectors using per-doc dimensions (supports mixed-dimension indexes)
      const sortedDocs = Object.values(meta.docs)
        .sort((a, b) => a.chunk_offset - b.chunk_offset)

      if (sortedDocs.length > 0 && sortedDocs.some(d => d.embedding_dimensions)) {
        // Per-doc dimension parsing (mixed-dimension index)
        // First, determine the correct fallback dimension for docs without embedding_dimensions.
        // meta.embedding_dimensions may be stale/wrong, so validate it against the binary data.
        const docsWithDims = sortedDocs.filter(d => d.embedding_dimensions)
        const docsWithoutDims = sortedDocs.filter(d => !d.embedding_dimensions)

        let fallbackDim = meta.embedding_dimensions || 768

        // Validate: calculate expected binary size using the fallback dim
        if (docsWithoutDims.length > 0) {
          const knownFloats = docsWithDims.reduce((sum, d) => sum + d.chunk_count * d.embedding_dimensions, 0)
          const unknownChunks = docsWithoutDims.reduce((sum, d) => sum + d.chunk_count, 0)
          const remainingFloats = arr.length - knownFloats

          if (unknownChunks > 0 && remainingFloats > 0) {
            const detectedDim = Math.round(remainingFloats / unknownChunks)
            // Only use detected dim if it's a known embedding dimension
            const knownDimensions = [384, 768, 1024, 1536, 3072]
            if (knownDimensions.includes(detectedDim) && detectedDim !== fallbackDim) {
              console.warn(`[IndexService] Detected actual dimension ${detectedDim} for ${docsWithoutDims.length} legacy docs (meta says ${fallbackDim}). Using detected value.`)
              fallbackDim = detectedDim
            }
          }
        }

        let floatOffset = 0
        let skippedChunks = 0
        for (const docMeta of sortedDocs) {
          const dims = docMeta.embedding_dimensions || fallbackDim
          for (let i = 0; i < docMeta.chunk_count; i++) {
            if (floatOffset + dims <= arr.length) {
              vectors.push(Array.from(arr.slice(floatOffset, floatOffset + dims)))
            } else {
              skippedChunks++
            }
            floatOffset += dims
          }
        }
        if (skippedChunks > 0) {
          console.error(`[IndexService] Binary parsing: ${skippedChunks} chunks skipped (binary too short). Expected ${floatOffset} floats, got ${arr.length}. Parsed ${vectors.length} vectors, expected ${meta.total_chunks}.`)
        }
      } else {
        // Legacy: single global dimension
        // Auto-detect dimension from binary size and chunk count
        let dims = meta.embedding_dimensions || 768
        if (meta.total_chunks > 0) {
          const detectedDim = Math.round(arr.length / meta.total_chunks)
          const knownDimensions = [384, 768, 1024, 1536, 3072]
          if (knownDimensions.includes(detectedDim) && detectedDim !== dims) {
            console.warn(`[IndexService] Detected actual dimension ${detectedDim} from binary (meta says ${dims}). Using detected value.`)
            dims = detectedDim
          }
        }
        for (let i = 0; i < arr.length; i += dims) {
          vectors.push(Array.from(arr.slice(i, i + dims)))
        }
      }

      // Validate parsed vectors match metadata expectations
      if (vectors.length !== meta.total_chunks) {
        console.warn(`[IndexService] Vector count mismatch: parsed ${vectors.length} vectors, metadata expects ${meta.total_chunks}. Binary length: ${arr.length} floats.`)
      }

      this.indexCache = { indexData: vectors, meta }
      return this.indexCache
    } catch (error) {
      // Index doesn't exist yet
      const emptyMeta = this.createEmptyMeta()
      this.indexCache = { indexData: [], meta: emptyMeta }
      return this.indexCache
    }
  }

  /**
   * Load chunk text metadata
   * @param {StorageAdapter} adapter
   * @returns {Promise<Object>}
   */
  async loadChunksMeta(adapter) {
    if (this.chunkTextCache) {
      return this.chunkTextCache
    }

    try {
      this.chunkTextCache = await adapter.readJSON('_system/index/chunks_meta.json')
      return this.chunkTextCache
    } catch {
      this.chunkTextCache = { chunks: {} }
      return this.chunkTextCache
    }
  }

  /**
   * Index a document
   * @param {string} docId - Document ID
   * @param {string} pdfURL - URL to PDF file
   * @param {StorageAdapter} adapter
   * @param {Function} onProgress - Progress callback
   */
  async indexDocument(docId, pdfURL, adapter, onProgress) {
    try {
      // 1. Extract text from PDF
      onProgress?.({ stage: 'extracting', docId, progress: 0 })
      const { text, pageTexts } = await textChunker.extractTextFromPDF(
        pdfURL,
        pdfjsLib,
        (page, total) => onProgress?.({ stage: 'extracting', docId, progress: page / total })
      )

      // 2. Chunk text (include annotations in context)
      onProgress?.({ stage: 'chunking', docId, progress: 0 })
      const cleanedText = textChunker.cleanText(text)

      // Get annotations for this document to include in embedding context
      const annotations = AnnotationService.getAnnotationsForAI(docId)
      const chunks = textChunker.chunk(cleanedText, { annotations })

      if (chunks.length === 0) {
        throw { code: 'NO_TEXT', message: 'No text could be extracted from PDF' }
      }

      // 3. Generate embeddings (uses batch API for cloud providers)
      onProgress?.({ stage: 'embedding', docId, progress: 0 })
      const chunkTexts = chunks.map(c => c.text)
      const embeddings = await embeddingService.embedBatch(chunkTexts, (current, total) => {
        onProgress?.({ stage: 'embedding', docId, progress: current / total, current, total })
      })

      // Check embedding dimensions
      const newDimensions = embeddings[0]?.length
      console.log('[IndexService] New embedding dimensions:', newDimensions)

      // 4. Load existing index
      let { indexData, meta } = await this.loadIndex(adapter)
      let chunksMeta = await this.loadChunksMeta(adapter)

      // 4a. Validate index integrity — if vector count doesn't match metadata,
      // the binary is corrupted (from previous parsing/save with wrong dimensions).
      // In that case, clear the entire index and start fresh.
      const isCorrupted = indexData.length > 0 && indexData.length !== meta.total_chunks
      if (isCorrupted) {
        console.warn(`[IndexService] Index corruption detected: ${indexData.length} vectors vs ${meta.total_chunks} expected. Clearing corrupted index.`)

        // Reset all previously-indexed documents' status to pending
        const updateDocument = useLibraryStore.getState().updateDocument
        for (const existingDocId of Object.keys(meta.docs)) {
          if (existingDocId !== docId) {
            updateDocument(existingDocId, { index_status: { status: 'pending' } })
          }
        }

        // Start with a clean slate
        indexData = []
        meta = this.createEmptyMeta()
        // Override the dimensions with actual value (not the default)
        meta.embedding_dimensions = newDimensions
        chunksMeta = { chunks: {} }
        this.indexCache = { indexData, meta }
        this.chunkTextCache = chunksMeta
      } else {
        // Check for dimension mismatch with existing index (non-corrupted)
        if (indexData.length > 0 && newDimensions) {
          const existingDimensions = indexData[0]?.length
          if (existingDimensions && existingDimensions !== newDimensions) {
            console.log(`[IndexService] Dimension mismatch: existing docs use ${existingDimensions}-dim, new doc uses ${newDimensions}-dim. Mixed dimensions supported.`)
          }
        }
      }

      // 5. Remove old data for this doc if re-indexing
      if (meta.docs[docId]) {
        const oldDoc = meta.docs[docId]
        const oldOffset = oldDoc.chunk_offset
        const oldCount = oldDoc.chunk_count

        // Remove old vectors
        indexData.splice(oldOffset, oldCount)

        // Remove old chunk metadata
        for (let i = 0; i < oldCount; i++) {
          delete chunksMeta.chunks[oldOffset + i]
        }

        // Shift offsets for docs that came after this one
        for (const [id, docMeta] of Object.entries(meta.docs)) {
          if (docMeta.chunk_offset > oldOffset) {
            docMeta.chunk_offset -= oldCount
          }
        }

        // Reindex chunk metadata keys
        const newChunks = {}
        for (const [key, val] of Object.entries(chunksMeta.chunks)) {
          const idx = parseInt(key, 10)
          if (idx > oldOffset) {
            newChunks[idx - oldCount] = val
          } else {
            newChunks[idx] = val
          }
        }
        chunksMeta.chunks = newChunks

        meta.total_chunks -= oldCount
        delete meta.docs[docId]

        console.log(`[IndexService] Removed old index data for ${docId}: ${oldCount} chunks at offset ${oldOffset}`)
      }

      // 6. Add new document chunks
      const offset = meta.total_chunks
      indexData.push(...embeddings)

      // Get the active embedding model name for per-doc tracking
      const embeddingModelName = await embeddingService.getModelName()

      meta.docs[docId] = {
        chunk_count: chunks.length,
        chunk_offset: offset,
        indexed_at: new Date().toISOString(),
        embedding_model: embeddingModelName,
        embedding_dimensions: newDimensions
      }
      meta.total_chunks += chunks.length
      meta.total_docs_indexed = Object.keys(meta.docs).length
      meta.last_updated = new Date().toISOString()

      // 7. Update chunks metadata
      chunks.forEach((chunk, i) => {
        chunksMeta.chunks[offset + i] = {
          doc_id: docId,
          chunk_index: i,
          text: chunk.text,
          text_preview: chunk.text.slice(0, 200),
          page_approx: textChunker.estimatePageNumber(chunk, pageTexts)
        }
      })

      // 8. Save to storage
      onProgress?.({ stage: 'saving', docId, progress: 0 })

      const binary = new Float32Array(indexData.flat()).buffer
      await adapter.uploadFile('_system/index/embeddings_v1.bin', new Blob([binary]))
      await adapter.writeJSON('_system/index/index_meta.json', meta)
      await adapter.writeJSON('_system/index/chunks_meta.json', chunksMeta)

      // 9. Update cache
      this.indexCache = { indexData, meta }
      this.chunkTextCache = chunksMeta

      // 10. Update document status in library (both store and storage)
      const indexStatus = {
        status: 'indexed',
        indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        embedding_version: 'v1',
        embedding_model: embeddingModelName
      }

      // Update Zustand store
      const updateDocument = useLibraryStore.getState().updateDocument
      updateDocument(docId, { index_status: indexStatus })

      // Persist to storage (include all library fields)
      const state = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, {
        version: '1.1',
        folders: state.folders,
        documents: state.documents,
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections
      })

      onProgress?.({ stage: 'complete', docId, progress: 1 })

      return { chunks: chunks.length }
    } catch (error) {
      console.error('Indexing failed:', error)

      // Update document status to failed (both store and storage)
      const failedStatus = {
        status: 'failed',
        error: error.message || 'Indexing failed'
      }

      // Update Zustand store
      const updateDocument = useLibraryStore.getState().updateDocument
      updateDocument(docId, { index_status: failedStatus })

      // Persist to storage (include all library fields)
      try {
        const state = useLibraryStore.getState()
        await LibraryService.saveLibrary(adapter, {
          version: '1.1',
          folders: state.folders,
          documents: state.documents,
          tag_registry: state.tagRegistry,
          collection_registry: state.collectionRegistry,
          smart_collections: state.smartCollections
        })
      } catch (saveError) {
        console.error('Failed to save library after indexing error:', saveError)
      }

      throw error
    }
  }

  /**
   * Search for relevant chunks
   * @param {string} query - Search query
   * @param {Object} scope - Search scope (type, docId, folderId)
   * @param {StorageAdapter} adapter
   * @param {number} topK - Number of results
   * @returns {Promise<Array>}
   */
  async search(query, scope, adapter, topK = 8) {
    console.log('IndexService.search called with scope:', scope)

    // Generate query embedding
    const queryEmbedding = await embeddingService.embed(query)
    console.log('Query embedding generated, length:', queryEmbedding.length)

    // Load index
    const { indexData, meta } = await this.loadIndex(adapter)
    const chunksMeta = await this.loadChunksMeta(adapter)

    console.log('Index loaded:', {
      totalVectors: indexData.length,
      totalDocs: meta.total_docs_indexed,
      totalChunks: meta.total_chunks,
      indexedDocIds: Object.keys(meta.docs),
      chunksMetaCount: Object.keys(chunksMeta.chunks || {}).length
    })

    if (indexData.length === 0) {
      console.warn('Index is empty, no vectors stored')
      return []
    }

    // Get relevant chunk indices based on scope
    const relevantIndices = this.getScopeIndices(scope, meta)
    console.log('Relevant indices for scope:', relevantIndices.length, 'indices')

    if (relevantIndices.length === 0) {
      // Log detailed info about why no indices were found
      if (scope.type === 'document' && scope.docId) {
        const docInIndex = !!meta.docs[scope.docId]
        console.warn(`No indices for document scope. Doc ${scope.docId} in index: ${docInIndex}. Indexed docs: [${Object.keys(meta.docs).join(', ')}]`)
        if (docInIndex) {
          const docMeta = meta.docs[scope.docId]
          console.warn(`Doc index meta: chunk_offset=${docMeta.chunk_offset}, chunk_count=${docMeta.chunk_count}`)
        }
      }
      return []
    }

    // Check for dimension mismatch — filter to compatible chunks instead of failing
    const queryDim = queryEmbedding.length
    if (indexData.length > 0 && relevantIndices.length > 0) {
      // Check if any relevant indices point beyond the vectors array (index corruption)
      const missingIndices = relevantIndices.filter(i => !indexData[i])
      if (missingIndices.length > 0) {
        console.error(`[IndexService] Index corruption: ${missingIndices.length}/${relevantIndices.length} chunk indices have no vectors. indexData.length=${indexData.length}, missing indices sample: [${missingIndices.slice(0, 5).join(', ')}]`)
        // Clear cache to force re-read from storage on next attempt
        this.indexCache = null
        this.chunkTextCache = null
        // Reset the corrupted document's status so the green circle goes away
        if (scope.type === 'document' && scope.docId) {
          useLibraryStore.getState().updateDocument(scope.docId, {
            index_status: { status: 'pending' }
          })
        }
        const error = new Error(
          'Document index is corrupted. Please re-index this document — indexing will automatically repair the index.'
        )
        error.code = 'DIMENSION_MISMATCH'
        throw error
      }

      const storedDim = indexData[relevantIndices[0]].length
      console.log('Embedding dimensions:', { query: queryDim, stored: storedDim })

      if (storedDim !== queryDim) {
        // Filter to only indices with matching dimensions
        const compatibleIndices = relevantIndices.filter(i =>
          indexData[i]?.length === queryDim
        )

        if (compatibleIndices.length === 0) {
          // No compatible embeddings at all — throw with helpful message
          this.indexCache = null
          this.chunkTextCache = null
          const error = new Error(
            storedDim === 768 && queryDim === 384
              ? 'Ollama is not responding. Documents were indexed with Ollama but it\'s currently unavailable. Please ensure Ollama is running.'
              : `Embedding dimension mismatch (stored: ${storedDim}, current: ${queryDim}). Please re-index this document.`
          )
          error.code = 'DIMENSION_MISMATCH'
          throw error
        }

        // Some docs have matching dimensions — search those, warn about others
        const totalDocs = new Set(relevantIndices.map(i => {
          const chunk = Object.values(meta.docs).find(d =>
            i >= d.chunk_offset && i < d.chunk_offset + d.chunk_count
          )
          return chunk
        })).size
        const compatibleDocs = new Set(compatibleIndices.map(i => {
          const chunk = Object.values(meta.docs).find(d =>
            i >= d.chunk_offset && i < d.chunk_offset + d.chunk_count
          )
          return chunk
        })).size

        console.warn(`[IndexService] Dimension mismatch: searching ${compatibleDocs}/${totalDocs} compatible docs. Re-index outdated documents for full coverage.`)

        // Use only compatible indices for the search
        relevantIndices.length = 0
        relevantIndices.push(...compatibleIndices)
      }
    }

    // Calculate similarity for each relevant chunk
    const allScores = relevantIndices.map(i => {
      const score = embeddingService.cosineSimilarity(queryEmbedding, indexData[i])
      return { index: i, score }
    })

    // Log ALL scores before filtering to debug
    const sortedScores = [...allScores].sort((a, b) => b.score - a.score)
    console.log('All similarity scores (top 10 before filter):', sortedScores.slice(0, 10).map(r => ({
      index: r.index,
      score: r.score,
      scoreStr: typeof r.score === 'number' ? r.score.toFixed(4) : r.score
    })))

    // Check if scores are valid numbers
    const invalidScores = allScores.filter(r => isNaN(r.score) || r.score === null || r.score === undefined)
    if (invalidScores.length > 0) {
      console.error('Invalid scores found:', invalidScores.length)
    }

    // Use a lower threshold for now to debug
    const results = allScores
      .filter(r => r.score > 0.1) // Lowered threshold for debugging
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    console.log('Results after filtering (threshold 0.1):', results.length)

    // Build result objects with text and citations
    const documents = useLibraryStore.getState().documents

    return results.map(r => {
      const chunkInfo = chunksMeta.chunks[r.index]
      const doc = documents[chunkInfo?.doc_id]

      return {
        ...chunkInfo,
        score: r.score,
        text: chunkInfo?.text || '',
        citation: this.buildCitation(doc),
        docTitle: doc?.metadata?.title || doc?.filename || 'Unknown'
      }
    })
  }

  /**
   * Get chunk indices for a given scope
   * @param {Object} scope
   * @param {Object} meta - Index metadata
   * @returns {number[]}
   */
  getScopeIndices(scope, meta) {
    const { documents, collectionRegistry } = useLibraryStore.getState()
    const indices = []

    console.log('getScopeIndices:', {
      scopeType: scope.type,
      scopeDocId: scope.docId,
      scopeFolderId: scope.folderId,
      scopeTags: scope.tags,
      scopeCollections: scope.collections,
      indexedDocs: Object.keys(meta.docs),
      libraryDocs: Object.keys(documents)
    })

    for (const [docId, docMeta] of Object.entries(meta.docs)) {
      const doc = documents[docId]
      if (!doc) {
        console.log('Document not found in library:', docId)
        continue
      }

      let include = false

      switch (scope.type) {
        case 'document':
          include = docId === scope.docId
          console.log(`Document scope check: ${docId} === ${scope.docId} = ${include}`)
          break
        case 'folder':
          include = doc.folder_id === scope.folderId
          console.log(`Folder scope check: ${doc.folder_id} === ${scope.folderId} = ${include}`)
          break
        case 'tags':
          // Filter by tags using AND/OR mode
          if (scope.tags && scope.tags.length > 0) {
            const docTags = doc.user_data?.tags || []
            if (scope.tagMode === 'AND') {
              include = scope.tags.every(t => docTags.includes(t))
            } else {
              include = scope.tags.some(t => docTags.includes(t))
            }
          } else {
            include = true // No tags selected = include all
          }
          break
        case 'collections':
          // Filter by collections using AND/OR mode
          if (scope.collections && scope.collections.length > 0) {
            const selectedCollectionObjects = scope.collections
              .map(slug => collectionRegistry[slug])
              .filter(Boolean)
            include = collectionService.documentMatchesCollections(
              doc,
              selectedCollectionObjects,
              scope.collectionMode || 'AND'
            )
          } else {
            include = true // No collections selected = include all
          }
          break
        case 'library':
          include = true
          break
        default:
          include = true
      }

      if (include) {
        // Add all chunk indices for this document
        for (let i = 0; i < docMeta.chunk_count; i++) {
          indices.push(docMeta.chunk_offset + i)
        }
      }
    }

    return indices
  }

  /**
   * Build citation string for a document
   * @param {Object} doc - Document record
   * @returns {string}
   */
  buildCitation(doc) {
    if (!doc?.metadata) return 'Unknown'

    const authors = doc.metadata.authors || []
    const year = doc.metadata.year

    if (authors.length === 0) {
      return year ? `[${year}]` : '[Unknown]'
    }

    const firstAuthor = authors[0].last || authors[0].first || 'Unknown'

    if (authors.length === 1) {
      return `[${firstAuthor}${year ? ' ' + year : ''}]`
    } else if (authors.length === 2) {
      const secondAuthor = authors[1].last || authors[1].first
      return `[${firstAuthor} & ${secondAuthor}${year ? ' ' + year : ''}]`
    } else {
      return `[${firstAuthor} et al.${year ? ' ' + year : ''}]`
    }
  }

  /**
   * Check if a document is indexed
   * @param {string} docId
   * @param {StorageAdapter} adapter
   * @returns {Promise<boolean>}
   */
  async isIndexed(docId, adapter) {
    const { meta } = await this.loadIndex(adapter)
    return !!meta.docs[docId]
  }

  /**
   * Clear index cache (call when switching storage)
   */
  clearCache() {
    this.indexCache = null
    this.chunkTextCache = null
  }

  /**
   * Remove index data for a single document
   * @param {string} docId - Document ID
   * @param {StorageAdapter} adapter
   */
  async removeDocumentIndex(docId, adapter) {
    try {
      const { indexData, meta } = await this.loadIndex(adapter)
      if (!meta.docs[docId]) return // Not indexed, nothing to do

      const chunksMeta = await this.loadChunksMeta(adapter)
      const oldDoc = meta.docs[docId]
      const oldOffset = oldDoc.chunk_offset
      const oldCount = oldDoc.chunk_count

      // Remove old vectors
      indexData.splice(oldOffset, oldCount)

      // Remove old chunk metadata
      for (let i = 0; i < oldCount; i++) {
        delete chunksMeta.chunks[oldOffset + i]
      }

      // Shift offsets for docs that came after this one
      for (const [id, docMeta] of Object.entries(meta.docs)) {
        if (docMeta.chunk_offset > oldOffset) {
          docMeta.chunk_offset -= oldCount
        }
      }

      // Reindex chunk metadata keys
      const newChunks = {}
      for (const [key, val] of Object.entries(chunksMeta.chunks)) {
        const idx = parseInt(key, 10)
        if (idx > oldOffset) {
          newChunks[idx - oldCount] = val
        } else {
          newChunks[idx] = val
        }
      }
      chunksMeta.chunks = newChunks

      meta.total_chunks -= oldCount
      delete meta.docs[docId]
      meta.total_docs_indexed = Object.keys(meta.docs).length

      // Save updated index
      const binary = new Float32Array(indexData.flat()).buffer
      await adapter.uploadFile('_system/index/embeddings_v1.bin', new Blob([binary]))
      await adapter.writeJSON('_system/index/index_meta.json', meta)
      await adapter.writeJSON('_system/index/chunks_meta.json', chunksMeta)

      // Update cache
      this.indexCache = { indexData, meta }
      this.chunkTextCache = chunksMeta

      console.log(`[IndexService] Removed index for ${docId}: ${oldCount} chunks`)
    } catch (error) {
      console.error(`[IndexService] Failed to remove index for ${docId}:`, error)
    }
  }

  /**
   * Clear entire index from storage (use when embedding model changes)
   * @param {StorageAdapter} adapter
   */
  async clearIndex(adapter) {
    try {
      // Delete index files from storage
      await adapter.deleteFile('_system/index/embeddings_v1.bin').catch(() => {})
      await adapter.deleteFile('_system/index/index_meta.json').catch(() => {})
      await adapter.deleteFile('_system/index/chunks_meta.json').catch(() => {})

      // Clear cache
      this.indexCache = null
      this.chunkTextCache = null

      // Clear index_status from all documents in library
      const { documents } = useLibraryStore.getState()
      const updateDocument = useLibraryStore.getState().updateDocument

      for (const docId of Object.keys(documents)) {
        if (documents[docId].index_status?.status === 'indexed') {
          updateDocument(docId, { index_status: null })
        }
      }

      // Save library (include all fields)
      const state = useLibraryStore.getState()
      await LibraryService.saveLibrary(adapter, {
        version: '1.1',
        folders: state.folders,
        documents: state.documents,
        tag_registry: state.tagRegistry,
        collection_registry: state.collectionRegistry,
        smart_collections: state.smartCollections
      })

      console.log('Index cleared successfully')
      return true
    } catch (error) {
      console.error('Failed to clear index:', error)
      throw error
    }
  }

  /**
   * Get indexing statistics
   * @param {StorageAdapter} adapter
   * @returns {Promise<Object>}
   */
  async getStats(adapter) {
    const { meta } = await this.loadIndex(adapter)
    return {
      totalDocs: meta.total_docs_indexed,
      totalChunks: meta.total_chunks,
      lastUpdated: meta.last_updated
    }
  }

  /**
   * Sync library.json index_status with actual index metadata
   * This fixes cases where library.json has stale status
   * @param {StorageAdapter} adapter
   * @returns {Promise<{synced: number, updated: boolean}>}
   */
  async syncIndexStatus(adapter) {
    try {
      const { meta } = await this.loadIndex(adapter)
      const { folders, documents } = useLibraryStore.getState()
      const updateDocument = useLibraryStore.getState().updateDocument

      let syncedCount = 0
      let needsSave = false

      // Check each document against index metadata
      for (const docId of Object.keys(documents)) {
        const doc = documents[docId]
        const isInIndex = !!meta.docs[docId]
        const currentStatus = doc.index_status?.status

        if (isInIndex && currentStatus !== 'indexed') {
          // Document is in index but library says it's not - update library
          const indexInfo = meta.docs[docId]
          updateDocument(docId, {
            index_status: {
              status: 'indexed',
              indexed_at: indexInfo.indexed_at,
              chunk_count: indexInfo.chunk_count,
              embedding_version: 'v1',
              embedding_model: indexInfo.embedding_model || meta.embedding_model,
              embedding_dimensions: indexInfo.embedding_dimensions || meta.embedding_dimensions
            }
          })
          syncedCount++
          needsSave = true
          console.log(`Synced index status for ${docId}: now indexed`)
        }
      }

      // Save updated library if changes were made (include all fields)
      if (needsSave) {
        const updatedState = useLibraryStore.getState()
        await LibraryService.saveLibrary(adapter, {
          version: '1.1',
          folders: updatedState.folders,
          documents: updatedState.documents,
          tag_registry: updatedState.tagRegistry,
          collection_registry: updatedState.collectionRegistry,
          smart_collections: updatedState.smartCollections
        })
        console.log(`Synced ${syncedCount} document(s) index status`)
      }

      return { synced: syncedCount, updated: needsSave }
    } catch (error) {
      console.error('Failed to sync index status:', error)
      return { synced: 0, updated: false }
    }
  }
}

export const indexService = new IndexService()
