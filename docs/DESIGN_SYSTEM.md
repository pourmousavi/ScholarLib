# ScholarLib — Design System

> Load this file when working on Stages 02, 03, 04.

---

## Design Philosophy

**Refined dark scholarly** — the visual language of a premium academic tool. Think a high-end journal platform crossed with a modern IDE. Not generic SaaS, not consumer app. Every detail communicates precision and trust.

Key decisions:
- **Dark-first** — academics read for hours; dark backgrounds reduce fatigue
- **Warm gold accent** — scholarly, timeless, avoids the cold teal/blue SaaS trope
- **Serif for headings** — Fraunces (optical, high-contrast) gives editorial gravitas
- **Monospace for metadata** — DM Mono for dates, counts, DOIs — feels precise
- **Generous whitespace** — documents are the content; UI recedes

---

## Color Tokens

Define in `src/styles/tokens.css`:

```css
:root {
  /* Backgrounds */
  --bg-base:       #0f1117;   /* main app background */
  --bg-sidebar:    #0a0d12;   /* sidebar + nav */
  --bg-surface:    #131720;   /* modals, cards */
  --bg-elevated:   #1a1f2e;   /* dropdowns, tooltips */
  --bg-hover:      rgba(255,255,255,0.03);
  --bg-selected:   rgba(212,175,100,0.07);

  /* Borders */
  --border-subtle: rgba(255,255,255,0.06);
  --border-default:rgba(255,255,255,0.09);
  --border-accent: rgba(212,175,100,0.28);

  /* Text */
  --text-primary:  #e2e4e9;   /* headings, important content */
  --text-secondary:#c0c2c8;   /* body text, chat messages */
  --text-tertiary: #8a90a0;   /* labels, secondary info */
  --text-muted:    #4a5060;   /* disabled, placeholders, timestamps */
  --text-faint:    #2d3444;   /* section labels, decorative */

  /* Accent — Gold */
  --accent:        #d4af64;
  --accent-dim:    rgba(212,175,100,0.12);
  --accent-border: rgba(212,175,100,0.25);
  --accent-gradient: linear-gradient(135deg, #d4af64, #8b6914);

  /* Semantic */
  --success:       #4ade80;
  --success-bg:    rgba(74,222,128,0.07);
  --warning:       #f59e0b;
  --warning-bg:    rgba(245,158,11,0.06);
  --error:         #f87171;
  --error-bg:      rgba(248,113,113,0.07);

  /* Sidebar selection indicator */
  --sidebar-selected-border: 2px solid var(--accent);

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Border radius */
  --radius-sm:  4px;
  --radius-md:  6px;
  --radius-lg:  10px;
  --radius-xl:  14px;

  /* Shadows */
  --shadow-modal: 0 24px 80px rgba(0,0,0,0.7);
  --shadow-card:  0 4px 16px rgba(0,0,0,0.3);
  --shadow-pdf:   0 8px 40px rgba(0,0,0,0.5);

  /* Transitions */
  --transition-fast: 0.12s ease;
  --transition-std:  0.2s ease;

  /* Panel widths */
  --sidebar-width:   228px;
  --doclist-width:   310px;
}
```

---

## Typography

### Fonts (Google Fonts — loaded in `index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&display=swap" rel="stylesheet">
```

### Usage Rules

| Use case | Font | Weight | Size |
|----------|------|--------|------|
| App name / panel titles | Fraunces | 400–500 | 14–16px |
| Body / UI labels | DM Sans | 400 | 12–13px |
| Buttons, nav items | DM Sans | 500 | 11–13px |
| Metadata, counts, DOIs | DM Mono | 400 | 10–12px |
| Section labels (caps) | DM Mono | 400 | 9px + letter-spacing: 0.12em |
| Chat messages | DM Sans | 400 | 13px, line-height 1.75 |
| Document titles | DM Sans | 500 | 12.5–14px |
| Note editor | DM Sans | 400 | 14px, line-height 1.95 |

---

## Component Specifications

### Button — `<Btn>`

Props: `gold` (primary), `small`, `onClick`, `disabled`

```css
/* Base */
.btn {
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: filter var(--transition-fast);
  padding: 7px 16px;
  font-size: 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  color: var(--text-tertiary);
}
.btn:hover { filter: brightness(1.15); }
.btn:active { filter: brightness(0.9); }
.btn:disabled { opacity: 0.4; cursor: default; }

/* Gold variant */
.btn--gold {
  background: var(--accent-gradient);
  border: none;
  color: #0a0d12;
  font-weight: 600;
}

/* Small variant */
.btn--small { padding: 4px 10px; font-size: 11px; }
```

### Tag — `<Tag>`

```css
.tag {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.04em;
}
.tag__remove {
  opacity: 0.5;
  cursor: pointer;
  font-size: 9px;
}
.tag__remove:hover { opacity: 1; }
```

### StatusDot — `<StatusDot status="indexed|pending|processing">`

```css
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot--indexed    { background: var(--success); }
.status-dot--pending    { background: var(--warning); }
.status-dot--processing { background: var(--accent); animation: pulse 1s infinite; }
```

### ConfidenceBar — `<ConfBar value={0-100}>`

```css
.conf-bar__track {
  width: 48px; height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
}
.conf-bar__fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
/* Color by value — applied via inline style from JS */
/* >90: var(--success), 70-90: var(--warning), <70: var(--error) */
```

### Input / Textarea

```css
.input {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  color: var(--text-secondary);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  transition: border-color var(--transition-fast);
}
.input:focus {
  outline: none;
  border-color: var(--accent-border);
}
.input::placeholder { color: var(--text-muted); }
```

### Modal Overlay

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(4px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  animation: fadeIn 0.15s ease;
}
.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
```

### Toast (error / success notification)

```css
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  font-size: 13px;
  font-family: 'DM Sans', sans-serif;
  min-width: 260px;
  max-width: 400px;
  animation: slideInRight 0.2s ease;
  border: 1px solid;
}
.toast--success { background: var(--success-bg); color: var(--success); border-color: rgba(74,222,128,0.2); }
.toast--error   { background: var(--error-bg);   color: var(--error);   border-color: rgba(248,113,113,0.2); }
.toast--warning { background: var(--warning-bg); color: var(--warning); border-color: rgba(245,158,11,0.2); }
.toast--info    { background: var(--accent-dim); color: var(--accent);  border-color: var(--accent-border); }
```

---

## Layout Specifications

### Three-Panel Shell

```
┌──────────────────────────────────────────────────────────────┐
│ SIDEBAR (228px fixed)                                        │
│  ├── Logo + user info (top, 60px)                            │
│  ├── Search bar (44px)                                       │
│  ├── Folder tree (flex grow, scrollable)                     │
│  └── Footer: Add/History/Settings + AI status (80px)        │
├──────────────────────────────────────────────────────────────┤
│ DOC LIST (310px fixed, scrollable)                           │
│  ├── Folder header + Add button (60px)                       │
│  ├── Filter tabs (36px)                                      │
│  ├── Document cards (scrollable)                             │
│  └── Pending notice (conditional, 36px)                     │
├──────────────────────────────────────────────────────────────┤
│ MAIN PANEL (flex grow, min-width 400px)                      │
│  ├── Top bar: doc title + panel switcher (50px)              │
│  └── Panel content (flex grow):                             │
│       PDF | AI Chat | Notes | [Metadata opens as modal]     │
└──────────────────────────────────────────────────────────────┘
```

Responsive breakpoints:
- **< 900px**: collapse doc list (slide-in drawer via hamburger)
- **< 640px**: collapse sidebar too (mobile mode)
- **iPad**: both panels accessible via bottom tab bar

### Folder Tree Item

```
[indent × depth] [▾ or ·] [Folder Name]       [count]
```
- Indent: `14px × depth`
- Selected: left border 2px solid accent, background accent-dim
- Hover: bg-hover
- Count: DM Mono, 10px, text-faint

### Document Card

```
[StatusDot] [Title — 2 lines max, ellipsis]
[Authors — 1 line, ellipsis]
[Year · Journal]    
[Tag] [Tag]
```
- Selected: left border 2px solid accent, background accent-dim
- Unread: text-primary, weight 500
- Read: text-muted, weight 400
- Card height: auto (min ~90px)

---

## Animations

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50%       { opacity: 1;   transform: scale(1); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Usage conventions:
   - Panel content swap: fadeIn 0.2s
   - AI messages appearing: fadeIn 0.25s  
   - Modals: fadeIn 0.15s
   - Toasts: slideInRight 0.2s
   - Processing dots: pulse 1.2s staggered
*/
```

---

## PDF Viewer (in-app)

The PDF renders in a white "paper" style inside the dark app, giving a reading-mode feel:

```
┌─────── Toolbar (dark) ───────────────────────────────────┐
│  [◂ Prev] [▸ Next]  Page 4/18  [─────] [⊕][⊖][⤢ Full] │
└──────────────────────────────────────────────────────────┘
┌─────── PDF Canvas area (dark bg #141820) ────────────────┐
│                                                          │
│         ┌──────────────────────────────┐                │
│         │  White PDF page              │                │
│         │  (max-width 680px centered)  │ shadow         │
│         │  border-radius: 4px          │                │
│         └──────────────────────────────┘                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## AI Chat Panel

```
┌── Scope selector ─────────────────────────── [Model status] ─┐
│  [This doc] [This folder ✓] [All library]   ● llama3.2 local │
└───────────────────────────────────────────────────────────────┘
┌── Messages (scrollable) ─────────────────────────────────────┐
│                                                               │
│  [✦] AI response text here, line-height 1.75                 │
│                                                               │
│                              [A] User message (right-aligned) │
│                                                               │
│  [✦] ● ● ●  (thinking animation)                            │
└───────────────────────────────────────────────────────────────┘
┌── Input area ────────────────────────────────────────────────┐
│  [textarea] [↑]                                              │
└───────────────────────────────────────────────────────────────┘
┌── Quick prompts ──────────────────────────────────────────────┐
│  [Summarise key findings] [Compare methods] [Research gaps]   │
└───────────────────────────────────────────────────────────────┘
```

AI Avatar: 26×26px circle, accent-gradient, "✦" symbol
User Avatar: 26×26px circle, bg-hover, first initial
