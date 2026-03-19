# Stage 01 — Project Scaffold, Vite, GitHub Pages CI/CD

## ⚠️ Context Window
Start fresh: `/clear` before beginning this stage.
Load: `CLAUDE.md` only.

## Goal
Create the repo, Vite + React project, CSS reset, font loading, and automated deployment to GitHub Pages. At the end of this stage, a "Hello ScholarLib" page deploys automatically on every push to `main`.

## Prerequisites (Ali must do first)
- [x] GitHub repo created (provide URL to Claude Code)
- [x] Node.js 18+ installed
- [x] Repo cloned locally

## Ali's Tasks Before Starting
1. Create GitHub repo (see `docs/USER_SETUP.md` §1.1)
2. Clone it: `git clone [repo-url] && cd scholarlib`
3. Tell Claude Code the GitHub username for Pages URL

## Claude Code Tasks

### 1. Initialize Vite project
```bash
npm create vite@latest . -- --template react
npm install
```

### 2. Install dependencies
```bash
npm install zustand nanoid
npm install -D @types/react @types/react-dom
```

### 3. Create folder structure
Create all directories in `src/` as listed in `CLAUDE.md` repository structure. Add `.gitkeep` to empty directories.

### 4. Create `src/styles/tokens.css`
Implement EXACTLY as specified in `docs/DESIGN_SYSTEM.md` — all CSS custom properties under `:root`.

### 5. Update `src/index.css`
```css
@import './styles/tokens.css';

*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'DM Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
input, textarea, button { font-family: inherit; }
```

### 6. Update `index.html`
- Add Google Fonts link (from `docs/DESIGN_SYSTEM.md` Typography section)
- Set title: `ScholarLib`
- Set favicon (use SVG: a simple "S" in gold on dark bg)
- Set meta description, theme-color (`#0f1117`), viewport

### 7. Create `src/App.jsx`
Minimal shell — just a div with background color and "ScholarLib" text to confirm fonts and tokens load:
```jsx
export default function App() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", color: 'var(--accent)', fontSize: 32 }}>
        ScholarLib
      </h1>
    </div>
  );
}
```

### 8. Update `vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/scholarlib/',  // MUST match repo name for GitHub Pages
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
```

### 9. Create `.gitignore`
```
node_modules/
dist/
.env
.env.local
.env.*.local
*.local
.DS_Store
Thumbs.db
```

### 10. Create `.github/workflows/deploy.yml`
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
        env:
          VITE_BOX_CLIENT_ID: ${{ secrets.VITE_BOX_CLIENT_ID }}
          VITE_BOX_REDIRECT_URI: ${{ secrets.VITE_BOX_REDIRECT_URI }}
          VITE_DROPBOX_APP_KEY: ${{ secrets.VITE_DROPBOX_APP_KEY }}
          VITE_WORKER_URL: ${{ secrets.VITE_WORKER_URL }}
          VITE_APP_BASE_URL: ${{ secrets.VITE_APP_BASE_URL }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

### 11. Create `README.md`
Brief project description, link to live app, "For build instructions see CLAUDE.md".

## Verification
```bash
npm run dev         # Opens on localhost:5173 — should show gold "ScholarLib" text
npm run build       # Should complete without errors
npm run preview     # Preview the production build
```

## Commit & Push
```bash
git add -A
git commit -m "feat: initial scaffold — Vite/React, design tokens, GitHub Pages CI"
git push origin main
```

Wait for GitHub Actions to complete (~2 min). Check `https://[username].github.io/scholarlib` loads.

## Ali's Tasks After This Stage
- Enable GitHub Pages: repo → Settings → Pages → Source: GitHub Actions
- Add GitHub secrets (see `docs/USER_SETUP.md` §4.2)

---

# Stage 02 — Design System Components

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`

## Goal
Build all reusable UI components: Btn, Tag, StatusDot, ConfBar, Input, Modal overlay, Toast system. These are the building blocks for every subsequent stage.

## Claude Code Tasks

### 1. `src/components/ui/Btn.jsx` + `Btn.module.css`
Implement per `docs/DESIGN_SYSTEM.md` Component Specifications. Props: `gold`, `small`, `disabled`, `onClick`, `children`, `style`, `className`.

### 2. `src/components/ui/Tag.jsx` + `Tag.module.css`
Props: `label`, `onRemove` (optional — renders ✕ button if provided).

### 3. `src/components/ui/StatusDot.jsx`
Props: `status` — one of `"indexed" | "pending" | "processing" | "none"`.

### 4. `src/components/ui/ConfBar.jsx`
Props: `value` (0–100). Color calculated in component (green/amber/red thresholds from design system).

### 5. `src/components/ui/Input.jsx`
Wraps `<input>` and `<textarea>`. Props: `multiline`, `rows`, `value`, `onChange`, `placeholder`, `type`, `style`.

### 6. `src/components/ui/Modal.jsx`
Overlay + centered container. Props: `onClose`, `width` (default 600px), `children`. Closes on overlay click and Escape key. Animate with `fadeIn`.

### 7. `src/components/ui/Toast.jsx` + `src/hooks/useToast.js`
Toast system with auto-dismiss (4 seconds). `useToast()` hook returns `{ showToast }`. `showToast({ message, type: 'success'|'error'|'warning'|'info' })`. Fixed position bottom-right. Max 3 visible at once.

### 8. `src/components/ui/Spinner.jsx`
Small animated spinner for loading states. Props: `size` (default 16px), `color` (default accent).

### 9. `src/components/ui/index.js`
Barrel export of all UI components.

### 10. Verify in App.jsx
Replace the placeholder with a component showcase displaying all components visually. Confirm they match the design spec before proceeding.

## Verification
Run `npm run dev` and visually confirm each component renders correctly with the right colors, fonts, and interactions.

## Commit
```bash
git commit -m "feat: design system components — Btn, Tag, StatusDot, ConfBar, Modal, Toast"
```

---

# Stage 03 — Three-Panel Layout, Sidebar, Folder Tree

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`

## Goal
Build the three-panel shell and a fully functional (mock data) sidebar with folder tree, search, and footer.

## Claude Code Tasks

### 1. `src/store/uiStore.js`
```javascript
import { create } from 'zustand'

export const useUIStore = create((set) => ({
  activePanel: 'pdf',
  showModal: null,
  sidebarCollapsed: false,
  setActivePanel: (panel) => set({ activePanel: panel }),
  setShowModal: (modal) => set({ showModal: modal }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
```

### 2. `src/store/libraryStore.js`
Implement with mock data (use real FolderNode shape from `docs/LIBRARY_SCHEMA.md`). Include 3 nested folders with realistic names. Selected folder/doc state.

### 3. `src/components/layout/AppShell.jsx` + `AppShell.module.css`
Three-column flex container. Fixed heights. Panel widths from CSS tokens. Overflow hidden. Import Sidebar, DocList, MainPanel.

### 4. `src/components/layout/Sidebar.jsx` + `Sidebar.module.css`
- Logo area (S icon + "ScholarLib" + user name)
- Search bar (input with ⌕ icon — functional later, visual now)
- FolderTree component
- Footer with three icon buttons (⊕ Add, ◎ History, ⚙ Settings) + AI status indicator

AI status indicator shows: colored dot + "Ollama · llama3.2 · local" (static text for now, made dynamic in Stage 09).

### 5. `src/components/library/FolderTree.jsx` + `FolderTree.module.css`
- Recursive component rendering FolderNode tree
- Expandable/collapsible with ▾/▸ toggle
- Selected state with left border accent + background
- Document count (right aligned, DM Mono)
- Section label "COLLECTIONS" above tree
- Drag-to-reorder (skip for now, add in Stage 17)
- Right-click context menu stub (implement in Stage 14)

### 6. Responsive behaviour
- Viewport < 900px: doc list collapses. Hamburger icon in main panel header shows/hides it as a drawer.
- Viewport < 640px: sidebar also collapses.
- Implement using CSS media queries + uiStore.sidebarCollapsed.

### 7. Update `src/App.jsx`
Render `<AppShell />` wrapping `<ToastProvider />`.

## Verification
- Folder tree renders mock data
- Clicking folders updates selected state
- Expanding/collapsing folders works
- All three panels visible on wide screen
- Responsive collapse works on narrow screen

## Commit
```bash
git commit -m "feat: three-panel layout, sidebar, and folder tree with mock data"
```

---

# Stage 04 — Document List Panel

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, `docs/LIBRARY_SCHEMA.md`

## Goal
Build the document list panel with document cards, filter tabs, and pending notice. All wired to libraryStore mock data.

## Claude Code Tasks

### 1. `src/components/library/DocList.jsx` + `DocList.module.css`
- Header: folder name + breadcrumb (BESS › Degradation), doc count, Add button
- Filter tab bar: All | Unread | Starred | Pending
- Scrollable document card list
- Pending documents notice at bottom (conditional — only shows if pendingDocs.length > 0)

### 2. `src/components/library/DocCard.jsx` + `DocCard.module.css`
Implement EXACTLY per `docs/DESIGN_SYSTEM.md` Document Card spec:
- StatusDot (left of title)
- Title (2-line clamp, bold if unread)
- Authors (1 line, muted)
- Year · Journal (DM Mono)
- Tags (wrapping row)
- Selected: left border accent + bg tint
- Click: updates selectedDocId in libraryStore
- Right-click: context menu (stub — "Move to...", "Edit metadata", "Delete") — implement fully in Stage 14

### 3. `src/components/library/PendingNotice.jsx`
Small bar at bottom of DocList: "⏳ N documents pending AI indexing" + "Index now →" button (wires to indexStore in Stage 11).

### 4. Sorting and filtering
Implement in libraryStore:
- `filterDocs(folderId, filter)` — returns docs filtered by All/Unread/Starred/Pending
- Sort: by date added desc (default)

### 5. Extend libraryStore mock data
Add 5 realistic mock DocumentRecords with varied index_status, read state, tags. Use realistic BESS/electricity market paper titles.

## Verification
- Filter tabs switch which docs show
- Unread docs appear bold
- Pending docs show amber dot
- Clicking doc updates main panel header

## Commit
```bash
git commit -m "feat: document list panel with cards, filters, and pending notice"
```

---

# Stage 05 — PDF Viewer

## ⚠️ Context Window
`/clear` then load: `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`

## Goal
Integrate PDF.js as the in-app PDF viewer. Renders PDFs from a URL (will be Box streaming URLs in Stage 06). For now, loads a sample PDF from a public URL for testing.

## Claude Code Tasks

### 1. Install PDF.js
```bash
npm install pdfjs-dist
```

### 2. Configure PDF.js worker
In `vite.config.js`, copy the PDF.js worker to public:
```javascript
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Add to plugins:
viteStaticCopy({
  targets: [{
    src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    dest: ''
  }]
})
```
Install: `npm install -D vite-plugin-static-copy`

In the PDF viewer component, set the worker source:
```javascript
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`
```

### 3. `src/components/viewer/PDFViewer.jsx` + `PDFViewer.module.css`

Props: `url` (string — the PDF URL to load), `onTextExtracted` (callback with full text, used for indexing in Stage 11).

Features:
- Loads PDF from URL using pdfjsLib.getDocument()
- Renders pages to canvas elements (render all pages, virtual scroll for performance)
- Toolbar: Previous/Next page, page indicator "Page N / Total", Zoom in/out (50%–200% in 25% steps), Fullscreen toggle
- Loading state: spinner centered in viewer area
- Error state: friendly message + retry button
- Text extraction: after load, extract all text in background (needed for Stage 11)
- Remembers scroll position per document (in sessionStorage keyed by doc_id)

Layout per `docs/DESIGN_SYSTEM.md` PDF Viewer specification:
- Dark bg (#141820) with white "paper" centered
- Canvas max-width 680px, border-radius 4px, box-shadow
- Smooth scroll between pages

### 4. `src/hooks/usePDFLoader.js`
Custom hook managing PDF loading state: `{ loading, error, pdf, currentPage, totalPages, zoom, goToPage, zoomIn, zoomOut }`.

### 5. `src/components/viewer/PDFToolbar.jsx`
Separate toolbar component. Buttons per design spec.

### 6. Wire into MainPanel
`src/components/layout/MainPanel.jsx` — renders PDFViewer when activePanel === 'pdf'. For now, pass a test PDF URL. Replace with Box streaming URL in Stage 06.

## Test PDF URL (for development only)
```
https://arxiv.org/pdf/2301.00001
```
Or any other public PDF URL that allows CORS.

⚠️ CORS note: PDF.js fetches the PDF. Box streaming URLs include proper CORS headers for authenticated requests. Third-party URLs may block CORS in development — use a local PDF in `/public/` for testing if needed.

## Verification
- PDF loads and renders correctly
- Page navigation works
- Zoom works
- Toolbar buttons are styled correctly
- Loading spinner shows while PDF fetches
- Error state shows on bad URL

## Commit
```bash
git commit -m "feat: PDF.js viewer with toolbar, zoom, page navigation"
```
