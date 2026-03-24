import { create } from 'zustand'
import { tagService } from '../services/tags/TagService'
import { smartCollectionService } from '../services/tags/SmartCollectionService'
import { collectionService } from '../services/tags/CollectionService'

// Mock folder data for development/offline mode
const mockFolders = [
  {
    id: 'f_root1',
    name: 'BESS',
    slug: 'bess',
    parent_id: null,
    children: ['f_bess1', 'f_bess2'],
    created_at: '2024-01-15T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 0
  },
  {
    id: 'f_bess1',
    name: 'Degradation',
    slug: 'degradation',
    parent_id: 'f_root1',
    children: ['f_bess1a'],
    created_at: '2024-01-16T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 0
  },
  {
    id: 'f_bess1a',
    name: 'Calendar Aging',
    slug: 'calendar-aging',
    parent_id: 'f_bess1',
    children: [],
    created_at: '2024-02-01T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 0
  },
  {
    id: 'f_bess2',
    name: 'Grid Integration',
    slug: 'grid-integration',
    parent_id: 'f_root1',
    children: [],
    created_at: '2024-01-17T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 1
  },
  {
    id: 'f_root2',
    name: 'Electricity Markets',
    slug: 'electricity-markets',
    parent_id: null,
    children: ['f_em1'],
    created_at: '2024-01-20T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 1
  },
  {
    id: 'f_em1',
    name: 'Price Forecasting',
    slug: 'price-forecasting',
    parent_id: 'f_root2',
    children: [],
    created_at: '2024-01-21T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 0
  },
  {
    id: 'f_root3',
    name: 'Demand Response',
    slug: 'demand-response',
    parent_id: null,
    children: [],
    created_at: '2024-02-10T10:00:00Z',
    shared_with: [],
    color: null,
    icon: null,
    sort_order: 2
  }
]

const mockDocuments = {
  'd_doc1': {
    id: 'd_doc1',
    folder_id: 'f_bess1',
    box_path: '/ScholarLib/PDFs/bess/degradation/zhang-2024-calendar-aging.pdf',
    box_file_id: 'box_123',
    filename: 'zhang-2024-calendar-aging.pdf',
    added_at: '2024-03-01T10:00:00Z',
    added_by: 'ali@adelaide.edu.au',
    metadata: {
      title: 'Calendar Aging Model for Li-Ion Batteries in Hot Climate Conditions',
      authors: [
        { last: 'Zhang', first: 'Y.', orcid: null },
        { last: 'Chen', first: 'L.', orcid: null }
      ],
      year: 2024,
      journal: 'Applied Energy',
      doi: '10.1016/j.apenergy.2024.01.042'
    },
    user_data: {
      read: false,
      starred: true,
      tags: ['degradation', 'thermal']
    },
    index_status: { status: 'indexed' }
  },
  'd_doc2': {
    id: 'd_doc2',
    folder_id: 'f_bess1',
    box_path: '/ScholarLib/PDFs/bess/degradation/li-2023-cycling-effects.pdf',
    box_file_id: 'box_124',
    filename: 'li-2023-cycling-effects.pdf',
    added_at: '2024-03-02T10:00:00Z',
    added_by: 'ali@adelaide.edu.au',
    metadata: {
      title: 'Cycling Effects on Lithium-Ion Battery Capacity Fade',
      authors: [{ last: 'Li', first: 'W.', orcid: null }],
      year: 2023,
      journal: 'Journal of Power Sources',
      doi: '10.1016/j.jpowsour.2023.05.001'
    },
    user_data: {
      read: true,
      starred: false,
      tags: ['cycling', 'capacity']
    },
    index_status: { status: 'indexed' }
  },
  'd_doc3': {
    id: 'd_doc3',
    folder_id: 'f_bess1',
    box_path: '/ScholarLib/PDFs/bess/degradation/kim-2024-state-estimation.pdf',
    box_file_id: 'box_125',
    filename: 'kim-2024-state-estimation.pdf',
    added_at: '2024-03-10T10:00:00Z',
    added_by: 'ali@adelaide.edu.au',
    metadata: {
      title: 'State of Health Estimation Using Machine Learning',
      authors: [{ last: 'Kim', first: 'J.', orcid: null }],
      year: 2024,
      journal: 'IEEE Transactions on Industrial Electronics',
      doi: '10.1109/TIE.2024.1234567'
    },
    user_data: {
      read: false,
      starred: false,
      tags: ['SOH', 'ML']
    },
    index_status: { status: 'pending' }
  },
  'd_doc4': {
    id: 'd_doc4',
    folder_id: 'f_bess2',
    box_path: '/ScholarLib/PDFs/bess/grid-integration/wang-2023-frequency.pdf',
    box_file_id: 'box_126',
    filename: 'wang-2023-frequency.pdf',
    added_at: '2024-02-15T10:00:00Z',
    added_by: 'ali@adelaide.edu.au',
    metadata: {
      title: 'Frequency Regulation with Battery Energy Storage Systems',
      authors: [{ last: 'Wang', first: 'H.', orcid: null }],
      year: 2023,
      journal: 'Energy',
      doi: '10.1016/j.energy.2023.02.015'
    },
    user_data: {
      read: true,
      starred: true,
      tags: ['frequency', 'ancillary']
    },
    index_status: { status: 'indexed' }
  },
  'd_doc5': {
    id: 'd_doc5',
    folder_id: 'f_em1',
    box_path: '/ScholarLib/PDFs/electricity-markets/price-forecasting/chen-2024-lstm.pdf',
    box_file_id: 'box_127',
    filename: 'chen-2024-lstm.pdf',
    added_at: '2024-03-05T10:00:00Z',
    added_by: 'ali@adelaide.edu.au',
    metadata: {
      title: 'LSTM-Based Electricity Price Forecasting in Deregulated Markets',
      authors: [{ last: 'Chen', first: 'X.', orcid: null }],
      year: 2024,
      journal: 'Electric Power Systems Research',
      doi: '10.1016/j.epsr.2024.03.005'
    },
    user_data: {
      read: false,
      starred: false,
      tags: ['LSTM', 'forecasting']
    },
    index_status: { status: 'processing' }
  }
}

// Mock tag registry for development
const mockTagRegistry = {
  'degradation': {
    displayName: 'Degradation',
    color: '#E85D75',
    category: 'topics',
    description: 'Battery degradation research',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  },
  'thermal': {
    displayName: 'Thermal',
    color: '#F39C12',
    category: 'topics',
    description: 'Thermal management',
    created_at: '2024-01-02T10:00:00Z',
    updated_at: '2024-01-02T10:00:00Z'
  },
  'cycling': {
    displayName: 'Cycling',
    color: '#4A90D9',
    category: 'topics',
    description: '',
    created_at: '2024-01-03T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z'
  },
  'capacity': {
    displayName: 'Capacity',
    color: '#50C878',
    category: 'topics',
    description: '',
    created_at: '2024-01-04T10:00:00Z',
    updated_at: '2024-01-04T10:00:00Z'
  },
  'soh': {
    displayName: 'SOH',
    color: '#9B59B6',
    category: 'topics',
    description: 'State of Health',
    created_at: '2024-01-05T10:00:00Z',
    updated_at: '2024-01-05T10:00:00Z'
  },
  'ml': {
    displayName: 'ML',
    color: '#1ABC9C',
    category: 'methods',
    description: 'Machine Learning',
    created_at: '2024-01-06T10:00:00Z',
    updated_at: '2024-01-06T10:00:00Z'
  },
  'frequency': {
    displayName: 'Frequency',
    color: '#E67E22',
    category: 'topics',
    description: 'Frequency regulation',
    created_at: '2024-01-07T10:00:00Z',
    updated_at: '2024-01-07T10:00:00Z'
  },
  'ancillary': {
    displayName: 'Ancillary',
    color: '#3498DB',
    category: 'topics',
    description: 'Ancillary services',
    created_at: '2024-01-08T10:00:00Z',
    updated_at: '2024-01-08T10:00:00Z'
  },
  'lstm': {
    displayName: 'LSTM',
    color: '#4A90D9',
    category: 'methods',
    description: '',
    created_at: '2024-01-09T10:00:00Z',
    updated_at: '2024-01-09T10:00:00Z'
  },
  'forecasting': {
    displayName: 'Forecasting',
    color: '#E85D75',
    category: 'topics',
    description: '',
    created_at: '2024-01-10T10:00:00Z',
    updated_at: '2024-01-10T10:00:00Z'
  }
}

// Mock collection registry for development
const mockCollectionRegistry = {
  'battery-research': {
    displayName: 'Battery Research',
    description: 'Core battery research papers',
    color: '#7C3AED',
    tags: ['degradation', 'thermal', 'cycling', 'capacity'],
    included_docs: [],
    excluded_docs: [],
    shared_with: [],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  },
  'ml-methods': {
    displayName: 'ML Methods',
    description: 'Machine learning methodology papers',
    color: '#0EA5E9',
    tags: ['ml', 'lstm', 'forecasting'],
    included_docs: [],
    excluded_docs: [],
    shared_with: [],
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-01-20T10:00:00Z'
  }
}

export const useLibraryStore = create((set, get) => ({
  // Library data
  folders: mockFolders,
  documents: mockDocuments,
  tagRegistry: mockTagRegistry,
  collectionRegistry: mockCollectionRegistry,
  smartCollections: [],
  libraryVersion: null,
  lastModified: null,

  // UI state
  selectedFolderId: null,
  selectedDocId: null,
  expandedFolders: [],

  // Tag filter state
  selectedTags: [],
  tagFilterMode: 'AND', // 'AND' | 'OR'

  // Collection filter state
  selectedCollections: [],
  collectionFilterMode: 'OR', // 'AND' | 'OR'

  // Smart collection state
  selectedCollectionId: null,

  // Bulk selection state
  selectedDocIds: [],
  selectionMode: false,

  // Set library data from storage
  setLibraryData: (library) => {
    const folders = library.folders || []
    const documents = library.documents || {}
    let tagRegistry = library.tag_registry || {}
    const collectionRegistry = library.collection_registry || {}
    const smartCollections = library.smart_collections || []

    // Sync orphan tags: find tags used in documents but not in registry
    const { syncedTags, registry: syncedRegistry } = tagService.syncOrphanTags(tagRegistry, documents)
    if (syncedTags.length > 0) {
      tagRegistry = syncedRegistry
    }

    // Auto-expand root folders
    const rootFolderIds = folders
      .filter(f => f.parent_id === null)
      .map(f => f.id)

    // Select first root folder if none selected
    const firstRootId = rootFolderIds[0] || null

    set({
      folders,
      documents,
      tagRegistry,
      collectionRegistry,
      smartCollections,
      libraryVersion: library.version,
      lastModified: library.last_modified,
      expandedFolders: rootFolderIds,
      selectedFolderId: firstRootId,
      selectedDocId: null,
      selectedCollections: [],
    })

    // Return syncedTags count so caller can save if needed
    return { syncedTags: syncedTags.length }
  },

  // Clear library (for logout)
  clearLibrary: () => {
    set({
      folders: [],
      documents: {},
      tagRegistry: {},
      collectionRegistry: {},
      smartCollections: [],
      libraryVersion: null,
      lastModified: null,
      selectedFolderId: null,
      selectedDocId: null,
      expandedFolders: [],
      selectedCollections: [],
    })
  },

  // Use mock data (for development without storage)
  useMockData: () => {
    set({
      folders: mockFolders,
      documents: mockDocuments,
      tagRegistry: mockTagRegistry,
      collectionRegistry: mockCollectionRegistry,
      smartCollections: [],
      expandedFolders: ['f_root1', 'f_bess1', 'f_root2'],
      selectedFolderId: 'f_bess1',
      selectedCollections: [],
    })
  },

  setSelectedFolderId: (id) => set({ selectedFolderId: id, selectedDocId: null }),
  setSelectedDocId: (id) => set({ selectedDocId: id }),

  toggleFolderExpanded: (id) => set((state) => {
    const expanded = state.expandedFolders.includes(id)
    return {
      expandedFolders: expanded
        ? state.expandedFolders.filter(f => f !== id)
        : [...state.expandedFolders, id]
    }
  }),

  // Tag filter actions
  toggleTagSelection: (slug) => set((state) => {
    const newTags = state.selectedTags.includes(slug)
      ? state.selectedTags.filter(t => t !== slug)
      : [...state.selectedTags, slug]
    return { selectedTags: newTags }
  }),

  setSelectedTags: (tags) => set({ selectedTags: tags }),

  setTagFilterMode: (mode) => set({ tagFilterMode: mode }),

  clearTagFilter: () => set({ selectedTags: [], tagFilterMode: 'AND' }),

  // Select a single tag for filtering (clears folder selection to show all matching docs)
  selectTagFilter: (slug) => set({
    selectedTags: [slug],
    selectedFolderId: null,  // Clear folder selection to show docs from all folders
    tagFilterMode: 'AND'
  }),

  // Add document to store (after saving to storage)
  addDocument: (doc) => set((state) => ({
    documents: { ...state.documents, [doc.id]: doc }
  })),

  // Update document in store
  updateDocument: (docId, updates) => set((state) => ({
    documents: {
      ...state.documents,
      [docId]: { ...state.documents[docId], ...updates }
    }
  })),

  // Remove document from store
  removeDocument: (docId) => set((state) => {
    const { [docId]: removed, ...rest } = state.documents
    return { documents: rest }
  }),

  // Add folder to store
  addFolder: (folder) => set((state) => ({
    folders: [...state.folders, folder]
  })),

  // Update folder in store
  updateFolder: (folderId, updates) => set((state) => ({
    folders: state.folders.map(f =>
      f.id === folderId ? { ...f, ...updates } : f
    )
  })),

  // Remove folder from store
  removeFolder: (folderId) => set((state) => ({
    folders: state.folders.filter(f => f.id !== folderId)
  })),

  // ============================================
  // Tag Registry Actions
  // ============================================

  // Create a new tag in the registry
  createTag: async (displayName, options = {}) => {
    const { tagRegistry } = get()
    const result = tagService.createTag(tagRegistry, displayName, options)

    if (result.error) {
      return result
    }

    const newRegistry = { ...tagRegistry, [result.slug]: result.tag }
    set({ tagRegistry: newRegistry })

    return result
  },

  // Update tag metadata (color, category, description, displayName)
  updateTag: (slug, updates) => {
    const { tagRegistry, documents } = get()
    const result = tagService.updateTag(tagRegistry, documents, {}, slug, updates)

    if (result.error) {
      return result
    }

    // Update registry
    const newRegistry = { ...tagRegistry }
    delete newRegistry[result.oldSlug]
    newRegistry[result.newSlug] = result.tag

    // Update documents if slug changed
    let newDocuments = documents
    if (result.slugChanged && result.docUpdates.length > 0) {
      newDocuments = { ...documents }
      for (const { docId, newTags } of result.docUpdates) {
        newDocuments[docId] = {
          ...newDocuments[docId],
          user_data: { ...newDocuments[docId].user_data, tags: newTags }
        }
      }
    }

    set({ tagRegistry: newRegistry, documents: newDocuments })
    return result
  },

  // Delete tag from registry, all documents, and all collections
  deleteTag: (slug) => {
    const { tagRegistry, documents, collectionRegistry } = get()
    const result = tagService.deleteTag(tagRegistry, documents, {}, slug)

    if (result.error) {
      return result
    }

    // Remove from registry
    const newRegistry = { ...tagRegistry }
    delete newRegistry[slug]

    // Update documents
    const newDocuments = { ...documents }
    for (const { docId, newTags } of result.affectedDocs) {
      newDocuments[docId] = {
        ...newDocuments[docId],
        user_data: { ...newDocuments[docId].user_data, tags: newTags }
      }
    }

    // Remove tag from all collections
    const collectionUpdates = collectionService.removeTagFromAllCollections(collectionRegistry, slug)
    const newCollectionRegistry = { ...collectionRegistry }
    for (const { collectionSlug, newTags } of collectionUpdates) {
      newCollectionRegistry[collectionSlug] = {
        ...newCollectionRegistry[collectionSlug],
        tags: newTags,
        updated_at: new Date().toISOString()
      }
    }

    set({
      tagRegistry: newRegistry,
      documents: newDocuments,
      collectionRegistry: newCollectionRegistry
    })
    return result
  },

  // Set tags for a specific document
  setDocumentTags: (docId, tags) => {
    const { documents } = get()
    const doc = documents[docId]
    if (!doc) {
      return { error: 'Document not found' }
    }

    const newDoc = {
      ...doc,
      user_data: { ...doc.user_data, tags }
    }
    const newDocuments = { ...documents, [docId]: newDoc }

    set({ documents: newDocuments })
    return { success: true }
  },

  // Add a tag to a document
  addTagToDocument: (docId, slug) => {
    const { documents, tagRegistry } = get()
    const doc = documents[docId]
    if (!doc) {
      return { error: 'Document not found' }
    }
    if (!tagRegistry[slug]) {
      return { error: 'Tag not found in registry' }
    }

    const currentTags = doc.user_data?.tags || []
    if (currentTags.includes(slug)) {
      return { error: 'Tag already added' }
    }

    const newTags = [...currentTags, slug]
    const newDoc = {
      ...doc,
      user_data: { ...doc.user_data, tags: newTags }
    }
    const newDocuments = { ...documents, [docId]: newDoc }

    set({ documents: newDocuments })
    return { success: true }
  },

  // Remove a tag from a document
  removeTagFromDocument: (docId, slug) => {
    const { documents } = get()
    const doc = documents[docId]
    if (!doc) {
      return { error: 'Document not found' }
    }

    const currentTags = doc.user_data?.tags || []
    const newTags = currentTags.filter(t => t !== slug)

    const newDoc = {
      ...doc,
      user_data: { ...doc.user_data, tags: newTags }
    }
    const newDocuments = { ...documents, [docId]: newDoc }

    set({ documents: newDocuments })
    return { success: true }
  },

  // Bulk add tag to multiple documents
  bulkAddTag: (slug, docIds) => {
    const { documents, tagRegistry } = get()
    if (!tagRegistry[slug]) {
      return { error: 'Tag not found in registry' }
    }

    const updates = tagService.addTagToDocuments(documents, slug, docIds)
    if (updates.length === 0) {
      return { success: true, updated: 0 }
    }

    const newDocuments = { ...documents }
    for (const { docId, newTags } of updates) {
      newDocuments[docId] = {
        ...newDocuments[docId],
        user_data: { ...newDocuments[docId].user_data, tags: newTags }
      }
    }

    set({ documents: newDocuments })
    return { success: true, updated: updates.length }
  },

  // Bulk remove tag from multiple documents
  bulkRemoveTag: (slug, docIds) => {
    const { documents } = get()
    const updates = tagService.removeTagFromDocuments(documents, slug, docIds)

    if (updates.length === 0) {
      return { success: true, updated: 0 }
    }

    const newDocuments = { ...documents }
    for (const { docId, newTags } of updates) {
      newDocuments[docId] = {
        ...newDocuments[docId],
        user_data: { ...newDocuments[docId].user_data, tags: newTags }
      }
    }

    set({ documents: newDocuments })
    return { success: true, updated: updates.length }
  },

  // Merge multiple tags into one
  mergeTags: (sourceSlugs, targetSlug) => {
    const { tagRegistry, documents } = get()
    const result = tagService.mergeTags(tagRegistry, documents, {}, sourceSlugs, targetSlug)

    if (result.error) {
      return result
    }

    // Update registry (remove source tags)
    const newRegistry = { ...tagRegistry }
    for (const slug of result.tagsToDelete) {
      delete newRegistry[slug]
    }

    // Update documents
    const newDocuments = { ...documents }
    for (const { docId, newTags } of result.docUpdates) {
      newDocuments[docId] = {
        ...newDocuments[docId],
        user_data: { ...newDocuments[docId].user_data, tags: newTags }
      }
    }

    set({ tagRegistry: newRegistry, documents: newDocuments })
    return result
  },

  // ============================================
  // Smart Collection Actions
  // ============================================

  createSmartCollection: (name, filter) => {
    const { smartCollections } = get()
    const collection = smartCollectionService.create(name, filter)
    const newCollections = [...smartCollections, collection]
    set({ smartCollections: newCollections })
    return collection
  },

  updateSmartCollection: (id, updates) => {
    const { smartCollections } = get()
    const newCollections = smartCollections.map(c =>
      c.id === id ? smartCollectionService.update(c, updates) : c
    )
    set({ smartCollections: newCollections })
  },

  deleteSmartCollection: (id) => {
    const { smartCollections, selectedCollectionId } = get()
    const newCollections = smartCollections.filter(c => c.id !== id)
    set({
      smartCollections: newCollections,
      selectedCollectionId: selectedCollectionId === id ? null : selectedCollectionId
    })
  },

  selectSmartCollection: (id) => {
    set({
      selectedCollectionId: id,
      selectedFolderId: null,
      selectedTags: [],
      selectedDocId: null
    })
  },

  clearSmartCollectionSelection: () => {
    set({ selectedCollectionId: null })
  },

  // ============================================
  // Bulk Selection Actions
  // ============================================

  toggleSelectionMode: () => {
    const { selectionMode } = get()
    set({ selectionMode: !selectionMode, selectedDocIds: [] })
  },

  toggleDocSelection: (docId) => {
    const { selectedDocIds } = get()
    const newIds = selectedDocIds.includes(docId)
      ? selectedDocIds.filter(id => id !== docId)
      : [...selectedDocIds, docId]
    set({ selectedDocIds: newIds })
  },

  selectAllVisible: (docIds) => {
    set({ selectedDocIds: docIds })
  },

  clearDocSelection: () => {
    set({ selectedDocIds: [], selectionMode: false })
  },

  // ============================================
  // Collection Registry Actions
  // ============================================

  // Create a new collection in the registry
  createCollection: async (displayName, options = {}) => {
    const { collectionRegistry } = get()
    const result = collectionService.createCollection(collectionRegistry, displayName, options)

    if (result.error) {
      return result
    }

    const newRegistry = { ...collectionRegistry, [result.slug]: result.collection }
    set({ collectionRegistry: newRegistry })

    return result
  },

  // Update collection metadata (color, description, displayName, tags)
  updateCollection: (slug, updates) => {
    const { collectionRegistry } = get()
    const result = collectionService.updateCollection(collectionRegistry, slug, updates)

    if (result.error) {
      return result
    }

    // Update registry
    const newRegistry = { ...collectionRegistry }
    delete newRegistry[result.oldSlug]
    newRegistry[result.newSlug] = result.collection

    // Update selectedCollections if slug changed
    let newSelectedCollections = get().selectedCollections
    if (result.slugChanged && newSelectedCollections.includes(result.oldSlug)) {
      newSelectedCollections = newSelectedCollections.map(s =>
        s === result.oldSlug ? result.newSlug : s
      )
    }

    set({ collectionRegistry: newRegistry, selectedCollections: newSelectedCollections })
    return result
  },

  // Delete collection from registry
  deleteCollection: (slug) => {
    const { collectionRegistry, selectedCollections } = get()
    const result = collectionService.deleteCollection(collectionRegistry, slug)

    if (result.error) {
      return result
    }

    // Remove from registry
    const newRegistry = { ...collectionRegistry }
    delete newRegistry[slug]

    // Remove from selection if selected
    const newSelectedCollections = selectedCollections.filter(s => s !== slug)

    set({ collectionRegistry: newRegistry, selectedCollections: newSelectedCollections })
    return result
  },

  // Merge multiple collections into one
  mergeCollections: (sourceSlugs, targetSlug) => {
    const { collectionRegistry, selectedCollections } = get()
    const result = collectionService.mergeCollections(collectionRegistry, sourceSlugs, targetSlug)

    if (result.error) {
      return result
    }

    // Update target collection's tags, included_docs, and excluded_docs
    const newRegistry = { ...collectionRegistry }
    newRegistry[targetSlug] = {
      ...newRegistry[targetSlug],
      tags: result.mergedTags,
      included_docs: result.mergedIncludedDocs || [],
      excluded_docs: result.mergedExcludedDocs || [],
      updated_at: new Date().toISOString()
    }

    // Remove source collections
    for (const slug of result.collectionsToDelete) {
      delete newRegistry[slug]
    }

    // Update selected collections
    const newSelectedCollections = selectedCollections.filter(
      s => !result.collectionsToDelete.includes(s)
    )

    set({ collectionRegistry: newRegistry, selectedCollections: newSelectedCollections })
    return result
  },

  // Add a tag to a collection
  addTagToCollection: (collectionSlug, tagSlug) => {
    const { collectionRegistry } = get()
    const result = collectionService.addTagToCollection(collectionRegistry, collectionSlug, tagSlug)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        tags: result.newTags,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true }
  },

  // Remove a tag from a collection
  removeTagFromCollection: (collectionSlug, tagSlug) => {
    const { collectionRegistry } = get()
    const result = collectionService.removeTagFromCollection(collectionRegistry, collectionSlug, tagSlug)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        tags: result.newTags,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true }
  },

  // Add a document directly to a collection (regardless of tags)
  addDocToCollection: (collectionSlug, docId) => {
    const { collectionRegistry } = get()
    const result = collectionService.addDocumentToCollection(collectionRegistry, collectionSlug, docId)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        included_docs: result.newIncludedDocs,
        excluded_docs: result.newExcludedDocs,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true }
  },

  // Remove a document from a collection (handles both explicit includes and tag-based membership)
  removeDocFromCollection: (collectionSlug, docId) => {
    const { collectionRegistry } = get()
    const result = collectionService.removeDocumentFromCollection(collectionRegistry, collectionSlug, docId)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        included_docs: result.newIncludedDocs,
        excluded_docs: result.newExcludedDocs,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true, wasExplicitlyIncluded: result.wasExplicitlyIncluded }
  },

  // Exclude a document from a collection (document keeps its tags but won't appear in collection)
  excludeDocFromCollection: (collectionSlug, docId) => {
    const { collectionRegistry } = get()
    const result = collectionService.excludeDocumentFromCollection(collectionRegistry, collectionSlug, docId)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        included_docs: result.newIncludedDocs,
        excluded_docs: result.newExcludedDocs,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true }
  },

  // Include a document in a collection (remove from exclusion list)
  includeDocInCollection: (collectionSlug, docId) => {
    const { collectionRegistry } = get()
    const result = collectionService.includeDocumentInCollection(collectionRegistry, collectionSlug, docId)

    if (result.error) {
      return result
    }

    const newRegistry = {
      ...collectionRegistry,
      [collectionSlug]: {
        ...collectionRegistry[collectionSlug],
        excluded_docs: result.newExcludedDocs,
        updated_at: new Date().toISOString()
      }
    }

    set({ collectionRegistry: newRegistry })
    return { success: true }
  },

  // ============================================
  // Collection Filter Actions
  // ============================================

  // Select a single collection for filtering (clears folder and tag selection)
  selectCollectionFilter: (slug) => set({
    selectedCollections: [slug],
    selectedFolderId: null,
    selectedTags: [],
    collectionFilterMode: 'OR'
  }),

  // Toggle collection selection (multi-select)
  toggleCollectionSelection: (slug) => set((state) => {
    const newCollections = state.selectedCollections.includes(slug)
      ? state.selectedCollections.filter(s => s !== slug)
      : [...state.selectedCollections, slug]
    return { selectedCollections: newCollections }
  }),

  // Set multiple collections at once
  setSelectedCollections: (collections) => set({ selectedCollections: collections }),

  // Set collection filter mode
  setCollectionFilterMode: (mode) => set({ collectionFilterMode: mode }),

  // Clear collection filter
  clearCollectionFilter: () => set({ selectedCollections: [], collectionFilterMode: 'OR' }),

  // ============================================
  // Bulk Deletion Actions
  // ============================================

  /**
   * Calculate impacts for bulk deletion operations
   */
  calculateDeletionImpacts: () => {
    const { tagRegistry, collectionRegistry, folders, documents } = get()

    const tagCount = Object.keys(tagRegistry).length
    const collectionCount = Object.keys(collectionRegistry).length
    const folderCount = folders.length
    const documentCount = Object.keys(documents).length

    // Count shared items
    const sharedTagCount = Object.values(tagRegistry).filter(t => t.shared_with?.length > 0).length
    const sharedCollectionCount = Object.values(collectionRegistry).filter(c => c.shared_with?.length > 0).length
    const sharedFolderCount = folders.filter(f => f.shared_with?.length > 0).length

    return {
      tagCount,
      collectionCount,
      folderCount,
      documentCount,
      sharedTagCount,
      sharedCollectionCount,
      sharedFolderCount,
    }
  },

  /**
   * Delete all tags from registry and documents
   * Also deletes all collections (they depend on tags)
   */
  deleteAllTags: async () => {
    const { documents, collectionRegistry } = get()

    // Remove all tags from all documents
    const newDocuments = { ...documents }
    for (const docId of Object.keys(newDocuments)) {
      newDocuments[docId] = {
        ...newDocuments[docId],
        user_data: {
          ...newDocuments[docId].user_data,
          tags: []
        }
      }
    }

    // Clear registry and collections
    set({
      tagRegistry: {},
      collectionRegistry: {},
      documents: newDocuments,
      selectedTags: [],
      selectedCollections: [],
    })

    return {
      tagsDeleted: Object.keys(get().tagRegistry).length || Object.keys(documents).length,
      collectionsDeleted: Object.keys(collectionRegistry).length,
    }
  },

  /**
   * Delete all collections (independent of tags)
   */
  deleteAllCollections: async () => {
    const { collectionRegistry } = get()
    const count = Object.keys(collectionRegistry).length

    set({
      collectionRegistry: {},
      selectedCollections: [],
    })

    return { collectionsDeleted: count }
  },

  /**
   * Delete all folders and documents
   * Also deletes all collections (they reference documents)
   * Preserves tags for reuse
   * @param {object} adapter - Storage adapter for deleting PDFs
   * @param {function} onProgress - Optional callback for progress updates
   */
  deleteAllFoldersAndDocuments: async (adapter, onProgress) => {
    const { folders, documents, collectionRegistry } = get()
    const docIds = Object.keys(documents)
    const folderCount = folders.length
    const collectionCount = Object.keys(collectionRegistry).length

    // Delete PDFs from storage
    let deletedPDFs = 0
    let failedPDFs = 0
    const totalDocs = docIds.length

    for (let i = 0; i < docIds.length; i++) {
      const docId = docIds[i]
      const doc = documents[docId]

      if (onProgress) {
        onProgress({
          phase: 'deleting_pdfs',
          current: i + 1,
          total: totalDocs,
          currentFile: doc.filename,
        })
      }

      if (doc.box_path && adapter) {
        try {
          await adapter.deleteFile(doc.box_path)
          deletedPDFs++
        } catch (err) {
          console.warn(`Failed to delete PDF: ${doc.box_path}`, err)
          failedPDFs++
        }
      }
    }

    // Clear folders, documents, and collections
    set({
      folders: [],
      documents: {},
      collectionRegistry: {},
      selectedFolderId: null,
      selectedDocId: null,
      expandedFolders: [],
      selectedCollections: [],
      selectedDocIds: [],
      selectionMode: false,
    })

    return {
      foldersDeleted: folderCount,
      documentsDeleted: totalDocs,
      collectionsDeleted: collectionCount,
      pdfsDeleted: deletedPDFs,
      pdfsFailed: failedPDFs,
    }
  },

  /**
   * Complete library reset - deletes everything
   * @param {object} adapter - Storage adapter for deleting PDFs
   * @param {function} onProgress - Optional callback for progress updates
   */
  resetLibrary: async (adapter, onProgress) => {
    const { folders, documents, tagRegistry, collectionRegistry } = get()
    const docIds = Object.keys(documents)
    const totalDocs = docIds.length
    const folderCount = folders.length
    const tagCount = Object.keys(tagRegistry).length
    const collectionCount = Object.keys(collectionRegistry).length

    // Delete PDFs from storage
    let deletedPDFs = 0
    let failedPDFs = 0

    for (let i = 0; i < docIds.length; i++) {
      const docId = docIds[i]
      const doc = documents[docId]

      if (onProgress) {
        onProgress({
          phase: 'deleting_pdfs',
          current: i + 1,
          total: totalDocs,
          currentFile: doc.filename,
        })
      }

      if (doc.box_path && adapter) {
        try {
          await adapter.deleteFile(doc.box_path)
          deletedPDFs++
        } catch (err) {
          console.warn(`Failed to delete PDF: ${doc.box_path}`, err)
          failedPDFs++
        }
      }
    }

    // Clear everything
    set({
      folders: [],
      documents: {},
      tagRegistry: {},
      collectionRegistry: {},
      smartCollections: [],
      selectedFolderId: null,
      selectedDocId: null,
      expandedFolders: [],
      selectedTags: [],
      selectedCollections: [],
      selectedDocIds: [],
      selectionMode: false,
      selectedCollectionId: null,
    })

    return {
      foldersDeleted: folderCount,
      documentsDeleted: totalDocs,
      tagsDeleted: tagCount,
      collectionsDeleted: collectionCount,
      pdfsDeleted: deletedPDFs,
      pdfsFailed: failedPDFs,
    }
  },
}))
