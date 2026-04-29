import { create } from 'zustand'

// Get initial theme from localStorage or system preference
const getInitialTheme = () => {
  const stored = localStorage.getItem('sv_theme')
  if (stored) return stored

  // Check system preference
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

// Get initial appearance settings from localStorage
const getInitialAppearance = () => {
  return {
    showDocCounts: localStorage.getItem('sv_show_doc_counts') !== 'false',
    fontSize: localStorage.getItem('sv_font_size') || 'normal',
    pdfDefaultZoom: parseInt(localStorage.getItem('sv_pdf_default_zoom')) || 100
  }
}

// Apply theme to document
const applyTheme = (theme) => {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('sv_theme', theme)
}

// Apply font size to document
const applyFontSize = (size) => {
  document.documentElement.setAttribute('data-font-size', size)
  localStorage.setItem('sv_font_size', size)
}

// Apply initial theme and font size immediately
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

const initialAppearance = getInitialAppearance()
applyFontSize(initialAppearance.fontSize)

// Get initial panel widths from localStorage
const getInitialPanelWidths = () => {
  const stored = localStorage.getItem('sv_panel_widths')
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      // Use defaults if parse fails
    }
  }
  return { sidebarWidth: 228, docListWidth: 310 }
}

const initialWidths = getInitialPanelWidths()

// Get initial split view settings from localStorage
const getInitialSplitViewSettings = () => {
  return {
    splitViewEnabled: localStorage.getItem('sv_split_view_enabled') === 'true',
    splitViewRatio: parseFloat(localStorage.getItem('sv_split_view_ratio')) || 0.7,
    splitViewRightTab: localStorage.getItem('sv_split_view_right_tab') || 'ai',
    splitViewDefaultEnabled: localStorage.getItem('sv_split_view_default') === 'true',
    fullscreenOverlayWidth: parseInt(localStorage.getItem('sv_fullscreen_overlay_width')) || 350
  }
}

// Get initial PDF viewer setting
const getInitialPdfViewer = () => {
  return localStorage.getItem('sv_pdf_viewer') || 'embedpdf' // 'embedpdf' (default) or 'pdfjs' (legacy)
}

const initialSplitView = getInitialSplitViewSettings()
const initialPdfViewer = getInitialPdfViewer()

export const useUIStore = create((set) => ({
  activePanel: 'pdf',
  previousPanel: null,
  wikiWorkspaceTab: localStorage.getItem('sv_wiki_workspace_tab') || 'inbox',
  showModal: null,
  sidebarCollapsed: false,
  docListCollapsed: false,
  theme: initialTheme,

  // Citation export state
  exportDocIds: [],      // Document IDs to export
  exportSource: null,    // 'document' | 'bulk' | 'folder' | 'tag' | 'collection'

  // Appearance settings
  showDocCounts: initialAppearance.showDocCounts,
  fontSize: initialAppearance.fontSize,
  pdfDefaultZoom: initialAppearance.pdfDefaultZoom,

  // Panel widths (resizable)
  sidebarWidth: initialWidths.sidebarWidth,
  docListWidth: initialWidths.docListWidth,

  // Split view settings
  splitViewEnabled: initialSplitView.splitViewEnabled,
  splitViewRatio: initialSplitView.splitViewRatio,
  splitViewRightTab: initialSplitView.splitViewRightTab,
  splitViewDefaultEnabled: initialSplitView.splitViewDefaultEnabled,
  fullscreenOverlayVisible: false,
  fullscreenOverlayWidth: initialSplitView.fullscreenOverlayWidth,

  // PDF viewer selection (pdfjs or embedpdf)
  pdfViewer: initialPdfViewer,

  setActivePanel: (panel) => set((state) => ({
    activePanel: panel,
    previousPanel: panel === state.activePanel ? state.previousPanel : state.activePanel,
  })),
  setWikiWorkspaceTab: (tab) => {
    localStorage.setItem('sv_wiki_workspace_tab', tab)
    set({ wikiWorkspaceTab: tab })
  },
  setShowModal: (modal) => set({ showModal: modal }),

  // Citation export actions
  setExportDocs: (docIds, source) => set({ exportDocIds: docIds, exportSource: source }),
  clearExportDocs: () => set({ exportDocIds: [], exportSource: null }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDocList: () => set((s) => ({ docListCollapsed: !s.docListCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setDocListCollapsed: (collapsed) => set({ docListCollapsed: collapsed }),

  // Mobile helper: close sidebar and show doclist
  showDocListMobile: () => set({ sidebarCollapsed: true, docListCollapsed: false }),
  // Mobile helper: close doclist and switch to PDF panel (after selecting a doc)
  closeDocListMobile: () => set({ docListCollapsed: true, activePanel: 'pdf' }),
  // Mobile helper: close all overlays
  closeAllOverlays: () => set({ sidebarCollapsed: true, docListCollapsed: true }),

  // Panel width setters
  setSidebarWidth: (width) => {
    const clampedWidth = Math.max(180, Math.min(400, width))
    localStorage.setItem('sv_panel_widths', JSON.stringify({
      sidebarWidth: clampedWidth,
      docListWidth: useUIStore.getState().docListWidth
    }))
    set({ sidebarWidth: clampedWidth })
  },
  setDocListWidth: (width) => {
    const clampedWidth = Math.max(200, Math.min(500, width))
    localStorage.setItem('sv_panel_widths', JSON.stringify({
      sidebarWidth: useUIStore.getState().sidebarWidth,
      docListWidth: clampedWidth
    }))
    set({ docListWidth: clampedWidth })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => set((s) => {
    const newTheme = s.theme === 'dark' ? 'light' : 'dark'
    applyTheme(newTheme)
    return { theme: newTheme }
  }),

  // Appearance setters
  setShowDocCounts: (show) => {
    localStorage.setItem('sv_show_doc_counts', show.toString())
    set({ showDocCounts: show })
  },
  setFontSize: (size) => {
    applyFontSize(size)
    set({ fontSize: size })
  },
  setPdfDefaultZoom: (zoom) => {
    localStorage.setItem('sv_pdf_default_zoom', zoom.toString())
    set({ pdfDefaultZoom: zoom })
  },

  // Split view actions
  setSplitViewEnabled: (enabled) => {
    localStorage.setItem('sv_split_view_enabled', enabled.toString())
    set({ splitViewEnabled: enabled })
  },
  toggleSplitView: () => set((s) => {
    const newEnabled = !s.splitViewEnabled
    localStorage.setItem('sv_split_view_enabled', newEnabled.toString())
    return { splitViewEnabled: newEnabled }
  }),
  setSplitViewRatio: (ratio) => {
    const clampedRatio = Math.max(0.4, Math.min(0.85, ratio))
    localStorage.setItem('sv_split_view_ratio', clampedRatio.toString())
    set({ splitViewRatio: clampedRatio })
  },
  setSplitViewRightTab: (tab) => {
    localStorage.setItem('sv_split_view_right_tab', tab)
    set({ splitViewRightTab: tab })
  },
  setSplitViewDefaultEnabled: (enabled) => {
    localStorage.setItem('sv_split_view_default', enabled.toString())
    set({ splitViewDefaultEnabled: enabled })
  },
  toggleFullscreenOverlay: () => set((s) => ({
    fullscreenOverlayVisible: !s.fullscreenOverlayVisible
  })),
  setFullscreenOverlayVisible: (visible) => set({ fullscreenOverlayVisible: visible }),
  setFullscreenOverlayWidth: (width) => {
    const clampedWidth = Math.max(250, Math.min(500, width))
    localStorage.setItem('sv_fullscreen_overlay_width', clampedWidth.toString())
    set({ fullscreenOverlayWidth: clampedWidth })
  },

  // PDF viewer setter
  setPdfViewer: (viewer) => {
    localStorage.setItem('sv_pdf_viewer', viewer)
    set({ pdfViewer: viewer })
  }
}))
