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
      const dims = meta.embedding_dimensions || 768

      for (let i = 0; i < arr.length; i += dims) {
        vectors.push(Array.from(arr.slice(i, i + dims)))
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

      // 2. Chunk text
      onProgress?.({ stage: 'chunking', docId, progress: 0 })
      const cleanedText = textChunker.cleanText(text)
      const chunks = textChunker.chunk(cleanedText)

      if (chunks.length === 0) {
        throw { code: 'NO_TEXT', message: 'No text could be extracted from PDF' }
      }

      // 3. Generate embeddings
      onProgress?.({ stage: 'embedding', docId, progress: 0 })
      const embeddings = []
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embeddingService.embed(chunks[i].text)
        embeddings.push(embedding)
        onProgress?.({ stage: 'embedding', docId, progress: (i + 1) / chunks.length, current: i + 1, total: chunks.length })
      }

      // 4. Load existing index
      const { indexData, meta } = await this.loadIndex(adapter)

      // 5. Add new document chunks
      const offset = meta.total_chunks
      indexData.push(...embeddings)

      meta.docs[docId] = {
        chunk_count: chunks.length,
        chunk_offset: offset,
        indexed_at: new Date().toISOString()
      }
      meta.total_chunks += chunks.length
      meta.total_docs_indexed = Object.keys(meta.docs).length
      meta.last_updated = new Date().toISOString()

      // 6. Update chunks metadata
      const chunksMeta = await this.loadChunksMeta(adapter)
      chunks.forEach((chunk, i) => {
        chunksMeta.chunks[offset + i] = {
          doc_id: docId,
          chunk_index: i,
          text: chunk.text,
          text_preview: chunk.text.slice(0, 200),
          page_approx: textChunker.estimatePageNumber(chunk, pageTexts)
        }
      })

      // 7. Save to storage
      onProgress?.({ stage: 'saving', docId, progress: 0 })

      const binary = new Float32Array(indexData.flat()).buffer
      await adapter.uploadFile('_system/index/embeddings_v1.bin', new Blob([binary]))
      await adapter.writeJSON('_system/index/index_meta.json', meta)
      await adapter.writeJSON('_system/index/chunks_meta.json', chunksMeta)

      // 8. Update cache
      this.indexCache = { indexData, meta }
      this.chunkTextCache = chunksMeta

      // 9. Update document status in library (both store and storage)
      const indexStatus = {
        status: 'indexed',
        indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        embedding_version: 'v1'
      }

      // Update Zustand store
      const updateDocument = useLibraryStore.getState().updateDocument
      updateDocument(docId, { index_status: indexStatus })

      // Persist to storage
      const { folders, documents } = useLibraryStore.getState()
      const library = {
        version: '1.0',
        last_modified: new Date().toISOString(),
        folders,
        documents
      }
      await LibraryService.saveLibrary(adapter, library)

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

      // Persist to storage
      try {
        const { folders, documents } = useLibraryStore.getState()
        const library = {
          version: '1.0',
          last_modified: new Date().toISOString(),
          folders,
          documents
        }
        await LibraryService.saveLibrary(adapter, library)
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
      console.log('Index is empty, no vectors stored')
      return []
    }

    // Get relevant chunk indices based on scope
    const relevantIndices = this.getScopeIndices(scope, meta)
    console.log('Relevant indices for scope:', relevantIndices.length, 'indices')

    if (relevantIndices.length === 0) {
      console.log('No relevant indices found for scope')
      return []
    }

    // Check for dimension mismatch
    if (indexData.length > 0 && relevantIndices.length > 0) {
      const storedDim = indexData[relevantIndices[0]]?.length
      const queryDim = queryEmbedding.length
      console.log('Embedding dimensions:', { query: queryDim, stored: storedDim })

      if (storedDim !== queryDim) {
        console.error('DIMENSION MISMATCH! Index needs to be rebuilt with current embedding model.')
        console.log('To fix: Re-index all documents using "Index All Documents" button')
        // Clear the cache to force re-download of index
        this.indexCache = null
        this.chunkTextCache = null
        return []
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
    const documents = useLibraryStore.getState().documents
    const indices = []

    console.log('getScopeIndices:', {
      scopeType: scope.type,
      scopeDocId: scope.docId,
      scopeFolderId: scope.folderId,
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
}

export const indexService = new IndexService()
