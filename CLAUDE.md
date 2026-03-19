# ScholarLib — Master Build Guide for Claude Code

## What is ScholarLib?

A professional academic reference manager web app built for Dr. Ali Pourmousavi (Senior Lecturer, University of Adelaide). It replaces Zotero/Mendeley with a fully custom solution that is:

- **Free** — no subscription, no storage cost
- **Private** — PDFs stored in University Box (unlimited), never on any third-party server
- **AI-powered** — local LLM via Ollama or WebLLM for document Q&A, with optional cloud API fallback
- **Cross-platform** — Mac, Windows, iPad via browser (PWA-installable)
- **Collaborative** — share folders with PhD students, tracked via Cloudflare Worker

---

## How to Use These Docs

This project is divided into **17 build stages**. Each stage is self-contained with clear inputs, outputs, and a commit instruction.

### ⚠️ Critical Rule: Context Window Management

At the start of EVERY new stage, run this in Claude Code:

```
/clear
```

Then load only the files needed for that stage. Do NOT carry context from previous stages unless explicitly listed in the stage's "Load these files" section. This keeps Claude Code accurate and fast.

### Stage Index

| Stage | Topic | Est. Time |
|-------|-------|-----------|
| [01](docs/stages/STAGE_01.md) | Project scaffold, Vite, GitHub Pages CI/CD | 1–2h |
| [02](docs/stages/STAGE_02.md) | Design system — tokens, fonts, base components | 2–3h |
| [03](docs/stages/STAGE_03.md) | Three-panel layout, sidebar, folder tree | 2–3h |
| [04](docs/stages/STAGE_04.md) | Document list panel with mock data | 2h |
| [05](docs/stages/STAGE_05.md) | PDF viewer (PDF.js) | 2–3h |
| [06](docs/stages/STAGE_06.md) | Storage abstraction — Box + Dropbox adapters | 3–4h |
| [07](docs/stages/STAGE_07.md) | Metadata extraction pipeline + review modal | 3–4h |
| [08](docs/stages/STAGE_08.md) | Notes panel + export (MD, PDF, DOCX) | 2–3h |
| [09](docs/stages/STAGE_09.md) | AI Chat — Ollama + WebLLM (local) | 3–4h |
| [10](docs/stages/STAGE_10.md) | AI Chat — Claude/OpenAI API fallback | 2h |
| [11](docs/stages/STAGE_11.md) | AI indexing pipeline + vector search | 4–5h |
| [12](docs/stages/STAGE_12.md) | Settings panel — all sections | 2–3h |
| [13](docs/stages/STAGE_13.md) | Cloudflare Worker backend | 3–4h |
| [14](docs/stages/STAGE_14.md) | Sharing, collaboration, activity dashboard | 3–4h |
| [15](docs/stages/STAGE_15.md) | Chat history persistence + export | 2h |
| [16](docs/stages/STAGE_16.md) | PWA setup, service worker, offline | 2h |
| [17](docs/stages/STAGE_17.md) | Polish, error handling, accessibility, final QA | 3–4h |

**Total estimated build time:** 42–58 hours of focused development

---

## Key Reference Docs

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design, data flow, API contracts
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — Colors, fonts, spacing, all component specs
- [USER_SETUP.md](docs/USER_SETUP.md) — Manual tasks Ali must complete (accounts, keys, config)
- [LIBRARY_SCHEMA.md](docs/LIBRARY_SCHEMA.md) — library.json data structure reference

---

## Repository Structure (final state)

```
scholarlib/
├── CLAUDE.md                    ← this file
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DESIGN_SYSTEM.md
│   ├── USER_SETUP.md
│   ├── LIBRARY_SCHEMA.md
│   └── stages/
│       ├── STAGE_01.md … STAGE_17.md
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   │   ├── ui/              ← design system components
│   │   ├── layout/          ← sidebar, panels, shell
│   │   ├── library/         ← folder tree, doc list, doc card
│   │   ├── viewer/          ← PDF viewer
│   │   ├── metadata/        ← extraction modal, form
│   │   ├── notes/           ← notes editor, export
│   │   ├── ai/              ← chat, history, scope selector
│   │   ├── settings/        ← all settings sections
│   │   └── sharing/         ← share modal, activity dashboard
│   ├── hooks/               ← custom React hooks
│   ├── services/
│   │   ├── storage/         ← Box, Dropbox adapters
│   │   ├── metadata/        ← CrossRef, Semantic Scholar, AI extraction
│   │   ├── ai/              ← Ollama, WebLLM, Claude API, OpenAI
│   │   ├── indexing/        ← PDF chunking, embeddings, vector search
│   │   └── library/         ← library.json CRUD
│   ├── store/               ← Zustand state management
│   ├── styles/
│   │   └── tokens.css       ← CSS custom properties
│   └── utils/
├── worker/
│   └── index.js             ← Cloudflare Worker
├── .github/
│   └── workflows/
│       └── deploy.yml       ← GitHub Pages CI
├── vite.config.js
├── package.json
└── index.html
```

---

## Tech Stack Summary

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | React 18 + Vite | Fast, familiar, great ecosystem |
| State | Zustand | Lightweight, no boilerplate |
| Styling | CSS custom properties + CSS modules | No build-time Tailwind needed |
| PDF viewing | PDF.js (Mozilla) | Industry standard, free |
| PDF text extraction | PDF.js (browser) | WASM, no server needed |
| Storage | Box API / Dropbox API | User-chosen at setup |
| Metadata | CrossRef, Semantic Scholar, AI | Cascading pipeline |
| Local AI | Ollama (API) + WebLLM (browser WASM) | Free, private |
| Cloud AI | Anthropic Claude API, OpenAI API | Optional fallback |
| Embeddings | nomic-embed-text (Ollama) or API | Semantic search |
| Vector search | usearch (WASM) | In-browser, no server |
| Backend | Cloudflare Worker + KV | Access logging, sharing |
| Hosting | GitHub Pages | Free, static |
| PWA | Workbox | Offline support |

---

## Environment Variables

Stored in `.env.local` (never committed). Create this file after cloning:

```
VITE_BOX_CLIENT_ID=your_box_app_client_id
VITE_BOX_REDIRECT_URI=https://yourusername.github.io/scholarlib/auth/box
VITE_DROPBOX_APP_KEY=your_dropbox_app_key
VITE_WORKER_URL=https://scholarlib-api.your-subdomain.workers.dev
VITE_APP_BASE_URL=https://yourusername.github.io/scholarlib
```

API keys for Claude/OpenAI are entered by users in Settings and stored in `localStorage` only. They are NEVER stored in Box, committed to git, or sent to the Cloudflare Worker.
