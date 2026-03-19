import { create } from 'zustand'

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

export const useLibraryStore = create((set, get) => ({
  // Library data
  folders: mockFolders,
  documents: mockDocuments,
  libraryVersion: null,
  lastModified: null,

  // UI state
  selectedFolderId: null,
  selectedDocId: null,
  expandedFolders: [],

  // Set library data from storage
  setLibraryData: (library) => {
    const folders = library.folders || []
    const documents = library.documents || {}

    // Auto-expand root folders
    const rootFolderIds = folders
      .filter(f => f.parent_id === null)
      .map(f => f.id)

    // Select first root folder if none selected
    const firstRootId = rootFolderIds[0] || null

    set({
      folders,
      documents,
      libraryVersion: library.version,
      lastModified: library.last_modified,
      expandedFolders: rootFolderIds,
      selectedFolderId: firstRootId,
      selectedDocId: null,
    })
  },

  // Clear library (for logout)
  clearLibrary: () => {
    set({
      folders: [],
      documents: {},
      libraryVersion: null,
      lastModified: null,
      selectedFolderId: null,
      selectedDocId: null,
      expandedFolders: [],
    })
  },

  // Use mock data (for development without storage)
  useMockData: () => {
    set({
      folders: mockFolders,
      documents: mockDocuments,
      expandedFolders: ['f_root1', 'f_bess1', 'f_root2'],
      selectedFolderId: 'f_bess1',
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
}))
