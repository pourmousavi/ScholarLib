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

This project is divided into **21 build stages**. Each stage is self-contained with clear inputs, outputs, and a commit instruction.

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
| [17](docs/stages/STAGE_12_to_17.md#stage-17--polish-error-handling-accessibility-final-qa) | Polish, error handling, accessibility, final QA | 3–4h |
| [18](docs/stages/STAGE_18_to_21.md#stage-18--tag-infrastructure) | Tag Infrastructure — registry, TagInput, document tagging | 4–5h |
| [19](docs/stages/STAGE_18_to_21.md#stage-19--tag-navigation--filtering) | Tag Navigation — sidebar section, filtering, multi-tag selection | 4–5h |
| [20](docs/stages/STAGE_18_to_21.md#stage-20--tag-scoped-ai-chat) | Tag-Scoped AI — multi-tag scope with AND/OR operators | 3–4h |
| [21](docs/stages/STAGE_18_to_21.md#stage-21--smart-collections--tag-management) | Smart Collections & Tag Management — colors, bulk ops, rename/merge | 5–6h |

**Total estimated build time:** 58–78 hours of focused development

---

## LLM Wiki Layer (Phases 0A–6+, additive)

After the 21 base stages, ScholarLib gained an **LLM-maintained markdown wiki** layered above the existing PDF library. It is opt-in, owned by the user (lives at `_wiki/` in their Box/Dropbox), and does not modify any pre-wiki feature. The wiki is built in **8 phases** plus a deferred Phase 7/8 backlog.

### Source of truth

The design contract is [`SCHOLARLIB_WIKI_DESIGN_V2_1.md`](SCHOLARLIB_WIKI_DESIGN_V2_1.md) at the repo root. Every architectural decision is numbered (`[DEC-NN]`) and every amendment is numbered (`[A-NN]`); reference these IDs when discussing trade-offs. The per-phase build prompts are `SCHOLARLIB_WIKI_PHASE_0A_PROMPT.md` through `SCHOLARLIB_WIKI_PHASE_6_PLUS_PROMPT.md`. The cross-phase corrections live in `scholarlib-wiki-phase-prompts-final-addendum.md` — apply these on every phase run.

### Phase status

| Phase | Topic | Status |
|---|---|---|
| 0A | Storage adapter API extension, page store, sidecars, two-phase op files, safety mode | shipped |
| 0B | Single-paper ingestion spike (extract → verify → propose → review) | shipped |
| 1 | 10-paper schema trial with kill/redesign gates and Phase 1 reporter | shipped |
| 2 | Inbox + ProposalReview UX with risk-tiered diffs and review-debt auto-pause | shipped |
| 3 | Controlled bootstrap (themes, dashboard extensions, lint cadence, Phase 3 report, Phase 5 readiness gates) | shipped |
| 4 | ChatOrchestrator extracted, RAG parity preserved | shipped |
| 5 | Wiki-assisted chat, multi-signal routing, save-as-candidate, benchmark | shipped |
| 6+ | Obsidian export, grant namespace, question clustering | shipped (subset) |
| 7 | Gap finder, cross-pollinator, position synthesizer, save-from-chat batch UI | not started |
| 8 | Grant pattern miner | not started |

### Working on the wiki

- **Read the design first.** When asked to extend any wiki feature, load `SCHOLARLIB_WIKI_DESIGN_V2_1.md` (or at least the relevant `[DEC-NN]` section), the matching phase prompt, and the addendum. Do not work from memory of the high-level shape.
- **Two-phase op files are non-negotiable** [A-01]. Pending op file written *before* page writes; committed op file written *after* successful page writes and sidecar regeneration. Recovery scans pending ops on startup.
- **Sidecars are generated, never hand-edited.** `pages.json`, `aliases.json`, `links.json`, `claims.json`, `sources.json`, `authors.json` regenerate from canonical pages.
- **Canonical wikilinks are ID-only** [A-06]. Proposals containing alias-style links are rejected before commit.
- **Risk tiers are deterministic.** Models propose; rules in code override. Encode the rules as code, not as prompts.
- **Sensitivity check is pre-prompt.** The provider router inspects `sensitivity:` and `allowed_providers:` *before* constructing any cloud-bound prompt. Grant content is Ollama-only by policy and never reaches a cloud provider.
- **Quality gates are checked, not asserted.** Phase 5 does not begin until all nine [DEC-19] gates return true. The checker is implemented in `BootstrapReporter.checkPhase5Gates`.

### Code map

```
src/services/wiki/
├── WikiPaths.js           ← single source of truth for storage paths
├── WikiStorage.js         ← readJSONOrNull, writeJSONWithRevision helpers
├── PageStore.js           ← CRUD over canonical markdown pages
├── SidecarService.js      ← regenerates _wiki/_system/*.json
├── OperationLogService.js ← two-phase op file writes + recovery
├── WikiStateService.js    ← safety mode state machine
├── extraction/            ← PaperExtractor, PdfTextExtractor (Phase 0B)
├── proposals/             ← ProposalBuilder, ProposalApplier, ProposalStore, ClaimVerifier, ReviewDebtCalculator
├── diff/                  ← PageDiffer for review UI
├── positions/             ← PositionDraftGenerator, PositionDraftService
├── migrations/            ← SchemaMigrationRunner + migration_1_*
├── phase1/                ← Phase 1 quality metrics, ingestion checklist, usefulness, reporter
├── phase3/                ← Phase 3 metrics (per-theme, cross-paper, cost projection)
├── bootstrap/             ← BootstrapPlanService, BootstrapContext, BootstrapReporter
├── lint/                  ← LintService (10 rules), LintScheduler
├── chat/                  ← ChatOrchestrator, IntentClassifier, WikiRetrieval, CandidateStore (Phases 4–5)
├── benchmark/             ← BenchmarkSession (Phase 5)
├── grants/                ← GrantIngestion, GrantNamespacePolicy, GrantLibraryClassifier (Phase 6+)
├── questions/             ← QuestionClusterer, QuestionPromoter (Phase 6+)
└── export/                ← ObsidianExporter, ObsidianFormatter (Phase 6+)

src/components/wiki/
├── WikiWorkspace.jsx      ← 6-tab shell (Inbox / Quality / Grants / Questions / Benchmark / Obsidian)
├── Inbox.jsx              ← proposals, lint, stale, recovery
├── ProposalReview.jsx     ← risk-tiered diffs, evidence viewer, accept/edit/reject
├── QualityDashboard.jsx   ← Phase 1 + Phase 3 metrics, mid-bootstrap banner, Phase 3 report button
├── bootstrap/             ← BootstrapList (built but not yet wired into a tab)
├── grants/GrantPanel.jsx
├── questions/QuestionInbox.jsx
├── benchmark/BenchmarkRunner.jsx
├── chat/SaveCandidateButton.jsx
├── proposalReview/        ← PageDiffView, SourceEvidencePopover, ChangeEditDialog, ProposalHeader, RiskTierSection
├── lint/LintReportView.jsx
└── recovery/RecoveryActions.jsx
```

### Key reference

- [`docs/docs/wiki/index.md`](docs/docs/wiki/index.md) — practical user guide; reference for "what does this surface do?"
- [`SCHOLARLIB_WIKI_DESIGN_V2_1.md`](SCHOLARLIB_WIKI_DESIGN_V2_1.md) §6.8 — full lint rule catalogue; §10 — phase exit criteria; §14 — glossary.
- The phase prompts each end with a "Notes for the user" section worth re-reading when picking up that phase's surface.

---

## Key Reference Docs

- [WIKI_USER_GUIDE.md](docs/docs/wiki/index.md) — End-to-end user walk-through of the wiki layer
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full system design, data flow, API contracts
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — Colors, fonts, spacing, all component specs
- [USER_SETUP.md](docs/USER_SETUP.md) — Manual tasks Ali must complete (accounts, keys, config)
- [LIBRARY_SCHEMA.md](docs/LIBRARY_SCHEMA.md) — library.json data structure reference
- [SCHOLARLIB_WIKI_DESIGN_V2_1.md](SCHOLARLIB_WIKI_DESIGN_V2_1.md) — Wiki layer design contract (source of truth)

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
│       ├── STAGE_01_to_05.md
│       ├── STAGE_06_to_11.md
│       ├── STAGE_12_to_17.md
│       └── STAGE_18_to_21.md
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   │   ├── ui/              ← design system components
│   │   ├── layout/          ← sidebar, panels, shell
│   │   ├── library/         ← folder tree, doc list, doc card, tags list
│   │   ├── viewer/          ← PDF viewer
│   │   ├── metadata/        ← extraction modal, form
│   │   ├── notes/           ← notes editor, export
│   │   ├── ai/              ← chat, history, scope selector
│   │   ├── settings/        ← all settings sections
│   │   ├── sharing/         ← share modal, activity dashboard
│   │   └── tags/            ← tag management modals (Stage 21)
│   ├── hooks/               ← custom React hooks
│   ├── services/
│   │   ├── storage/         ← Box, Dropbox adapters
│   │   ├── metadata/        ← CrossRef, Semantic Scholar, AI extraction
│   │   ├── ai/              ← Ollama, WebLLM, Claude API, OpenAI, Gemini
│   │   ├── indexing/        ← PDF chunking, embeddings, vector search
│   │   ├── library/         ← library.json CRUD
│   │   └── tags/            ← tag registry, smart collections
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
| Cloud AI | Anthropic Claude API, OpenAI API, Google Gemini API | Optional fallback (Gemini has free tier) |
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
