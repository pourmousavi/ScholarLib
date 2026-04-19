import { describe, it, expect, vi } from 'vitest'
import { LibraryService } from '../LibraryService.js'

const mockAdapter = {
  uploadFile: vi.fn().mockResolvedValue('file-id-123'),
  writeJSON: vi.fn().mockResolvedValue(undefined),
  readJSON: vi.fn().mockResolvedValue(null),
}

const emptyLibrary = {
  version: '1.1',
  folders: [{ id: 'f_root', name: 'Root', slug: 'root', parent_id: null, children: [] }],
  documents: {},
  tag_registry: {},
  collection_registry: {},
  smart_collections: [],
  last_modified: null,
}

describe('LibraryService.addDocument', () => {
  it('preserves import_source from LitOrbit', async () => {
    const library = { ...emptyLibrary, documents: {} }

    const doc = await LibraryService.addDocument(mockAdapter, library, {
      folder_id: 'f_root',
      filename: '',
      metadata: {
        title: 'Test Paper',
        doi: '10.1234/test',
        authors: [{ first: 'J.', last: 'Smith', orcid: null }],
      },
      import_source: {
        type: 'litorbit',
        original_id: 'uuid-123',
        imported_at: '2026-04-19T10:00:00Z',
        litorbit_score: 8.5,
      },
    }, null)

    expect(doc.import_source).toBeDefined()
    expect(doc.import_source.type).toBe('litorbit')
    expect(doc.import_source.original_id).toBe('uuid-123')
    expect(doc.import_source.litorbit_score).toBe(8.5)
    expect(doc.box_file_id).toBeNull()
    expect(doc.filename).toBe('')
  })

  it('creates document without import_source when not provided', async () => {
    const library = { ...emptyLibrary, documents: {} }

    const doc = await LibraryService.addDocument(mockAdapter, library, {
      folder_id: 'f_root',
      filename: 'test.pdf',
      metadata: { title: 'Regular Upload' },
    }, new Blob(['fake-pdf']))

    expect(doc.import_source).toBeNull()
    expect(doc.box_file_id).toBe('file-id-123')
  })
})

describe('LibraryService duplicate detection', () => {
  const library = {
    ...emptyLibrary,
    documents: {
      'd_existing': {
        id: 'd_existing',
        metadata: {
          title: 'Existing Paper on Battery Degradation',
          doi: '10.1016/j.apenergy.2024.01.042',
        },
      },
    },
  }

  it('finds duplicate by DOI (case-insensitive)', () => {
    const dup = LibraryService.findDuplicateByDOI(library, '10.1016/J.APENERGY.2024.01.042')
    expect(dup).toBeDefined()
    expect(dup.id).toBe('d_existing')
  })

  it('returns null when DOI not found', () => {
    const dup = LibraryService.findDuplicateByDOI(library, '10.9999/nonexistent')
    expect(dup).toBeNull()
  })

  it('returns null for empty DOI', () => {
    const dup = LibraryService.findDuplicateByDOI(library, '')
    expect(dup).toBeNull()
  })

  it('finds duplicate by title (case-insensitive)', () => {
    const dup = LibraryService.findDuplicateByTitle(library, 'existing paper on battery degradation')
    expect(dup).toBeDefined()
    expect(dup.id).toBe('d_existing')
  })

  it('returns null for empty title', () => {
    const dup = LibraryService.findDuplicateByTitle(library, '')
    expect(dup).toBeNull()
  })
})
