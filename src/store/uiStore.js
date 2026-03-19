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

export const useUIStore = create((set) => ({
  activePanel: 'pdf',
  showModal: null,
  sidebarCollapsed: false,
  docListCollapsed: false,
  theme: initialTheme,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowModal: (modal) => set({ showModal: modal }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDocList: () => set((s) => ({ docListCollapsed: !s.docListCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setDocListCollapsed: (collapsed) => set({ docListCollapsed: collapsed }),

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
