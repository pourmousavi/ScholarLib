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

// Apply theme to document
const applyTheme = (theme) => {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem('sv_theme', theme)
}

// Apply initial theme immediately
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

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

export const useUIStore = create((set) => ({
  activePanel: 'pdf',
  showModal: null,
  sidebarCollapsed: false,
  docListCollapsed: false,
  theme: initialTheme,

  // Panel widths (resizable)
  sidebarWidth: initialWidths.sidebarWidth,
  docListWidth: initialWidths.docListWidth,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowModal: (modal) => set({ showModal: modal }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDocList: () => set((s) => ({ docListCollapsed: !s.docListCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setDocListCollapsed: (collapsed) => set({ docListCollapsed: collapsed }),

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
  })
}))
