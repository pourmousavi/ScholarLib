import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LibraryService } from '../LibraryService.js'

function createMockAdapter({ failSaveLibrary = false, failDeleteFile = false } = {}) {
  return {
    uploadFile: vi.fn().mockResolvedValue('uploaded-file-id'),
    writeJSON: failSaveLibrary
      ? vi.fn().mockRejectedValue(new Error('Save failed'))
      : vi.fn().mockResolvedValue(undefined),
    readJSON: vi.fn().mockResolvedValue(null),
    deleteFile: failDeleteFile
      ? vi.fn().mockRejectedValue(new Error('Delete failed'))
      : vi.fn().mockResolvedValue(undefined),
  }
}

function createEmptyLibrary() {
  return {
    version: '1.2',
    schema_revision: 0,
    folders: [{ id: 'f_root', name: 'Root', slug: 'root', parent_id: null, children: [] }],
    documents: {},
    tag_registry: {},
    collection_registry: {},
    smart_collections: [],
    last_modified: null,
  }
}

describe('LibraryService transactional addDocument', () => {
  it('rolls back uploaded file when saveLibrary fails', async () => {
    const adapter = createMockAdapter({ failSaveLibrary: true })
    const library = createEmptyLibrary()

    await expect(
      LibraryService.addDocument(adapter, library, {
        folder_id: 'f_root',
        filename: 'test.pdf',
        metadata: { title: 'Test' },
      }, new Blob(['fake-pdf']))
    ).rejects.toThrow('Save failed')

    // Upload was called
    expect(adapter.uploadFile).toHaveBeenCalledTimes(1)
    // Rollback: deleteFile was called to clean up the orphan
    expect(adapter.deleteFile).toHaveBeenCalledWith('PDFs/test.pdf')
    // Document was removed from library
    expect(Object.keys(library.documents)).toHaveLength(0)
  })

  it('does not call deleteFile when no file was uploaded', async () => {
    const adapter = createMockAdapter({ failSaveLibrary: true })
    const library = createEmptyLibrary()

    await expect(
      LibraryService.addDocument(adapter, library, {
        folder_id: 'f_root',
        filename: '',
        metadata: { title: 'Metadata-only doc' },
      }, null)
    ).rejects.toThrow('Save failed')

    expect(adapter.uploadFile).not.toHaveBeenCalled()
    expect(adapter.deleteFile).not.toHaveBeenCalled()
  })
})

describe('LibraryService transactional deleteDocument', () => {
  it('saves library before deleting file', async () => {
    const adapter = createMockAdapter()
    const library = createEmptyLibrary()
    library.documents['d_test'] = {
      id: 'd_test',
      box_path: 'PDFs/test.pdf',
      box_file_id: 'file-123',
    }

    await LibraryService.deleteDocument(adapter, library, 'd_test')

    // Library save should happen before file delete
    expect(adapter.writeJSON).toHaveBeenCalled()
    expect(adapter.deleteFile).toHaveBeenCalledWith('PDFs/test.pdf')
    expect(library.documents['d_test']).toBeUndefined()
  })

  it('tracks orphan when file delete fails', async () => {
    const adapter = createMockAdapter({ failDeleteFile: true })
    const library = createEmptyLibrary()
    library.documents['d_test'] = {
      id: 'd_test',
      box_path: 'PDFs/test.pdf',
      box_file_id: 'file-123',
    }

    await LibraryService.deleteDocument(adapter, library, 'd_test')

    // Document should still be removed from library
    expect(library.documents['d_test']).toBeUndefined()
    // Orphan path should be tracked
    expect(library.orphaned_files).toContain('PDFs/test.pdf')
  })
})

describe('LibraryService transactional attachPdf', () => {
  it('rolls back when saveLibrary fails after upload', async () => {
    const adapter = createMockAdapter({ failSaveLibrary: true })
    const library = createEmptyLibrary()
    library.documents['d_test'] = {
      id: 'd_test',
      box_path: '',
      box_file_id: null,
      filename: '',
    }

    await expect(
      LibraryService.attachPdf(adapter, library, 'd_test', new Blob(['pdf']), 'new.pdf')
    ).rejects.toThrow('Save failed')

    // Should have tried to delete the newly uploaded file
    expect(adapter.deleteFile).toHaveBeenCalledWith('PDFs/new.pdf')
    // Document should be restored to previous state
    expect(library.documents['d_test'].box_path).toBe('')
    expect(library.documents['d_test'].box_file_id).toBeNull()
  })
})
