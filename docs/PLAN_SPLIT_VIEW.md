# Split View Feature — Implementation Plan

## Overview

Add a split-view mode to the right panel where:
- **Left side (70%)**: PDF viewer (always visible)
- **Right side (30%)**: Tabbed panel with AI Chat and Notes

Users can toggle between current single-panel view and split view. The split ratio is resizable and persisted.

---

## Current Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar (228px)  │  DocList (310px)  │     MainPanel (flex)    │
│                   │                   │                         │
│  • Folders        │  • Doc cards      │  [PDF | AI | Notes] ←tabs│
│  • Collections    │                   │                         │
│  • Tags           │                   │   One panel at a time   │
└─────────────────────────────────────────────────────────────────┘
```

**Key files:**
- `src/components/layout/MainPanel.jsx` — Tab-based panel switching
- `src/components/viewer/PDFViewer.jsx` — Has fullscreen support
- `src/store/uiStore.js` — Layout state + localStorage persistence
- `src/components/settings/` — Settings modal sections

---

## Proposed Architecture

### Normal View (current behavior)
```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar  │  DocList  │           MainPanel                     │
│           │           │  [PDF | AI Chat | Notes] ← tab bar      │
│           │           │                                         │
│           │           │   Shows one panel at a time             │
└─────────────────────────────────────────────────────────────────┘
```

### Split View (new)
```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar  │  DocList  │           MainPanel                     │
│           │           │  ┌──────────────┬─────────────────┐     │
│           │           │  │              │ [AI Chat|Notes] │     │
│           │           │  │   PDF View   │─────────────────│     │
│           │           │  │    (70%)     │   Active tab    │     │
│           │           │  │              │     (30%)       │     │
│           │           │  └──────────────┴─────────────────┘     │
│           │           │         ↕ resizable divider             │
└─────────────────────────────────────────────────────────────────┘
```

### Fullscreen PDF with Split (overlay mode)
```
┌─────────────────────────────────────────────────────────────────┐
│                                              ┌─────────────────┐│
│                                              │ [AI Chat|Notes] ││
│              PDF Viewer (fullscreen)         │─────────────────││
│                                              │   Active tab    ││
│                                              │    (350px)      ││
│                                              │                 ││
│                                              └─────────────────┘│
│  [Toggle overlay button]                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Narrow Screen (vertical stack)
```
┌───────────────────────┐
│  Sidebar (collapsed)  │
├───────────────────────┤
│                       │
│     PDF Viewer        │
│       (60%)           │
│                       │
├───────────────────────┤
│  [AI Chat | Notes]    │
│─────────────────────  │
│    Active tab (40%)   │
│                       │
└───────────────────────┘
```

---

## Implementation Tasks

### Task 1: Update State Management (uiStore.js)

Add new state properties:

```javascript
// New split-view state
splitViewEnabled: false,              // Toggle for split view mode
splitViewRatio: 0.7,                  // PDF takes 70% by default
splitViewRightTab: 'ai',              // 'ai' or 'notes' - active tab in right panel
splitViewDefaultEnabled: false,       // User's preferred default (from settings)
fullscreenOverlayVisible: false,      // For fullscreen PDF overlay toggle
fullscreenOverlayWidth: 350,          // Width of overlay panel in fullscreen

// New actions
setSplitViewEnabled: (enabled) => set({ splitViewEnabled: enabled }),
setSplitViewRatio: (ratio) => set({ splitViewRatio: ratio }),
setSplitViewRightTab: (tab) => set({ splitViewRightTab: tab }),
setSplitViewDefaultEnabled: (enabled) => set({ splitViewDefaultEnabled: enabled }),
toggleFullscreenOverlay: () => set(s => ({ fullscreenOverlayVisible: !s.fullscreenOverlayVisible })),
setFullscreenOverlayWidth: (width) => set({ fullscreenOverlayWidth: width }),
```

**Persistence:** Add to localStorage save/load:
- `sv_split_view_enabled` — last used state
- `sv_split_view_ratio` — user's preferred ratio
- `sv_split_view_right_tab` — last active tab
- `sv_split_view_default` — permanent default from settings
- `sv_fullscreen_overlay_width` — overlay width preference

---

### Task 2: Create SplitViewPanel Component

**New file:** `src/components/layout/SplitViewPanel.jsx`

```jsx
// Renders side-by-side PDF + tabbed Notes/AI Chat
// - Left: PDFViewer (width based on splitViewRatio)
// - Resize handle (4px draggable divider)
// - Right: Tabbed panel with AI Chat / Notes tabs
```

**Features:**
- Horizontal flex layout
- Draggable resize handle between panels
- Tab bar for AI Chat / Notes in right panel
- Minimum widths: PDF 40%, Right panel 20%
- Maximum widths: PDF 85%, Right panel 60%

---

### Task 3: Update MainPanel Component

**File:** `src/components/layout/MainPanel.jsx`

**Changes:**
1. Add split-view toggle button to top bar
2. Conditionally render:
   - If `splitViewEnabled`: render `<SplitViewPanel />`
   - Else: render current tab-based layout
3. Keep existing tab bar for normal mode
4. Add keyboard shortcut handler for toggle

**Top bar modifications:**
```
[Document Title] [Share] | [Split View Toggle] | [PDF] [AI Chat] [Notes] (hidden in split mode)
```

---

### Task 4: Create FullscreenOverlay Component

**New file:** `src/components/layout/FullscreenOverlay.jsx`

```jsx
// Overlay panel for fullscreen PDF mode
// - Fixed position on right side
// - Draggable width (250-500px)
// - Tab bar: AI Chat / Notes
// - Toggle button to show/hide
// - Slide-in animation
```

**Features:**
- Appears when PDF is fullscreen AND split view is enabled
- Semi-transparent backdrop option
- Draggable left edge for resizing
- Close button and Escape key support
- Persisted width preference

---

### Task 5: Update PDFViewer for Fullscreen Overlay

**File:** `src/components/viewer/PDFViewer.jsx`

**Changes:**
1. When entering fullscreen, check if split view is enabled
2. If enabled, render toggle button for overlay
3. Communicate fullscreen state to parent (or use uiStore)
4. Handle overlay toggle within fullscreen context

---

### Task 6: Add Responsive Vertical Stacking

**File:** `src/components/layout/SplitViewPanel.jsx` (or new)

**Breakpoint logic:**
- If MainPanel width < 600px: stack vertically (60/40 split)
- If MainPanel width >= 600px: horizontal split

**CSS approach:**
```css
.splitContainer {
  display: flex;
  flex-direction: row;
}

@container (max-width: 600px) {
  .splitContainer {
    flex-direction: column;
  }
}
```

Or use ResizeObserver to detect container width and adjust layout.

---

### Task 7: Add Settings Section

**File:** `src/components/settings/AppearanceSection.jsx` (or new section)

**New settings:**
1. **Default View Mode**
   - Radio: "Single panel (tabs)" / "Split view (PDF + Notes/AI)"

2. **Default Split Ratio**
   - Slider: 50% — 85% for PDF width
   - Preview of ratio

3. **Fullscreen Overlay**
   - Toggle: "Show Notes/AI overlay in fullscreen PDF"
   - Width slider: 250px — 500px

---

### Task 8: Add Keyboard Shortcut

**Shortcut:** `Cmd/Ctrl + Shift + S` — Toggle split view

**Implementation:**
- Add to existing keyboard handler in App.jsx or AppShell.jsx
- Show in help modal / keyboard shortcuts list

---

### Task 9: Add View Menu (optional)

If there's an existing menu system, add:
- View → Split View (toggle, with checkmark)
- View → Single Panel View

---

### Task 10: CSS Module Updates

**New file:** `src/components/layout/SplitViewPanel.module.css`

```css
.container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.pdfSection {
  flex-shrink: 0;
  overflow: hidden;
  min-width: 40%;
  max-width: 85%;
}

.resizeHandle {
  width: 4px;
  background: var(--border-default);
  cursor: col-resize;
  flex-shrink: 0;
}

.resizeHandle:hover {
  background: var(--accent);
}

.rightSection {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 150px;
  overflow: hidden;
}

.tabBar {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  padding: var(--space-1);
  gap: var(--space-1);
}

.tab {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.tab.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.tabContent {
  flex: 1;
  overflow: hidden;
}

/* Vertical stack mode */
.container.vertical {
  flex-direction: column;
}

.container.vertical .pdfSection {
  min-width: unset;
  max-width: unset;
  min-height: 40%;
  max-height: 75%;
}

.container.vertical .resizeHandle {
  width: 100%;
  height: 4px;
  cursor: row-resize;
}

.container.vertical .rightSection {
  min-width: unset;
  min-height: 100px;
}
```

**New file:** `src/components/layout/FullscreenOverlay.module.css`

```css
.overlay {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-default);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease;
}

.overlay.hidden {
  transform: translateX(100%);
}

.resizeHandle {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
}

.toggleButton {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 999;
  /* Styling for collapse/expand button */
}
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/store/uiStore.js` | Modify | Add split view state & actions |
| `src/components/layout/SplitViewPanel.jsx` | Create | New split view container |
| `src/components/layout/SplitViewPanel.module.css` | Create | Split view styles |
| `src/components/layout/FullscreenOverlay.jsx` | Create | Fullscreen overlay panel |
| `src/components/layout/FullscreenOverlay.module.css` | Create | Overlay styles |
| `src/components/layout/MainPanel.jsx` | Modify | Add split view toggle & conditional rendering |
| `src/components/layout/MainPanel.module.css` | Modify | Add toggle button styles |
| `src/components/viewer/PDFViewer.jsx` | Modify | Support fullscreen overlay integration |
| `src/components/settings/AppearanceSection.jsx` | Modify | Add split view settings |
| `src/App.jsx` or `AppShell.jsx` | Modify | Add keyboard shortcut handler |

---

## Implementation Order

1. **State management** (uiStore.js) — Foundation for everything else
2. **SplitViewPanel component** — Core split view functionality
3. **MainPanel integration** — Toggle and conditional rendering
4. **Keyboard shortcut** — Quick access
5. **Responsive stacking** — Handle narrow screens
6. **FullscreenOverlay** — Fullscreen PDF support
7. **Settings section** — User preferences
8. **Polish & testing** — Edge cases, animations, persistence

---

## Edge Cases to Handle

1. **No document selected**: Split view should show placeholder in PDF area
2. **Window resize**: Re-evaluate vertical/horizontal mode
3. **Split ratio persistence**: Save after drag ends, not during
4. **Fullscreen exit**: Restore previous split state
5. **Mobile detection**: Disable split view entirely on phones
6. **Tab memory**: Remember which tab (AI/Notes) was active
7. **Theme changes**: Overlay and split view respect dark/light mode

---

## Open Questions (Resolved)

| Question | Answer |
|----------|--------|
| Toggle location | Toolbar + keyboard shortcut + settings |
| Starting ratio | 70% PDF / 30% right panel |
| Resizable | Yes, with drag handle |
| Narrow screen behavior | Stack vertically |
| State persistence | Yes, remember all preferences |
| Fullscreen behavior | Toggleable overlay sidebar |
| Tab state memory | Yes, preserve active tab |
| Mobile support | Disabled on phones, tablet depends on size/orientation |

---

## Estimated Effort

| Task | Complexity | Notes |
|------|-----------|-------|
| State management | Low | Extend existing patterns |
| SplitViewPanel | Medium | New component with resize logic |
| MainPanel updates | Low | Conditional rendering |
| FullscreenOverlay | Medium | Fixed positioning, animations |
| Settings section | Low | Add to existing settings |
| Responsive logic | Medium | Container queries or ResizeObserver |
| Keyboard shortcuts | Low | Add to existing handler |
| Testing & polish | Medium | Edge cases, persistence |

---

## Dependencies

- No new npm packages required
- Leverages existing resize patterns from AppShell
- Uses existing CSS custom properties for theming
- Reuses existing PDFViewer, ChatPanel, NotesPanel components
