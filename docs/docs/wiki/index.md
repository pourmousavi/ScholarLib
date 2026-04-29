---
sidebar_position: 1
slug: /wiki
title: Wiki Layer User Guide
description: How to use the LLM Wiki layer end-to-end — from your first paper ingestion through wiki-assisted chat.
---

# ScholarLib Wiki — User Guide

Practical walk-through of the LLM Wiki layer: what it is, where to click, what each surface does, and how to move from a fresh install to a knowledge graph that supports your real writing.

> **Source of truth.** This guide describes the application as shipped through Phase 6+. The authoritative design lives in [`SCHOLARLIB_WIKI_DESIGN_V2_1.md`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_DESIGN_V2_1.md); the phase-by-phase build instructions live in `SCHOLARLIB_WIKI_PHASE_*.md` at the repository root. When this guide and the design disagree, the design wins — please open an issue so the guide can be corrected.

---

## 1. What the wiki is (and is not)

The wiki is a persistent, LLM-maintained markdown layer that sits above your PDFs in Box or Dropbox. The model does the bookkeeping you would otherwise abandon — cross-referencing claims across papers, keeping concept summaries current, flagging contradictions, tracking unanswered questions. Pages compound with use because answers from chat can be filed back into them.

This is structurally different from RAG, which re-derives an answer from raw chunks per query and accumulates nothing. The wiki *accumulates* synthesis; RAG remains available for verification and extractive subqueries.

**It is:**

- A collection of markdown pages under `_wiki/` in your own cloud storage. You own the files. You can read them in any text editor.
- A proposal-and-review system: the model proposes changes, you accept or reject, the system commits with audit records.
- Additive to ScholarLib: every existing feature (folders, tags, RAG chat, notes, citation export, sharing) keeps working unchanged.

**It is not:**

- A graph database. Relationships are stored as wikilinks in markdown.
- A second app to maintain. The wiki updates only when you ingest papers or save chat answers.
- A replacement for chat. Chat now routes between wiki and RAG depending on the query.

**Page types you will see:**

| Type | Prefix | Purpose |
|---|---|---|
| Paper | `p_` | One per ingested paper; carries claims, methods used, datasets, concepts touched |
| Concept | `c_` | A domain idea (e.g. "calendar aging in BESS") aggregating across papers |
| Method | `m_` | An approach or technique referenced by multiple papers |
| Dataset | `d_` | A dataset reused across papers |
| Person | `pe_` | An author with a disambiguated identity (mostly Phase 6+) |
| Position draft | `po_` | A synthesis page in your voice — opinionated, state-tracked |
| Grant | `g_` | Grant proposal/report content (private namespace) |
| Open question | `q_` | A question candidate promoted to canonical (Phase 6+) |

Page IDs are immutable ULIDs; titles and filenames (`handle`) are renameable. Wikilinks in canonical pages always reference the ID, never the handle.

---

## 2. Why it exists

The wiki layer was designed for five jobs in priority order:

1. **Idea generation and gap-finding** — surface concepts under-represented in your corpus.
2. **Paper drafting and literature reviews** — the wiki writes itself as you ingest, so a literature review is a wiki query, not a fresh synthesis.
3. **Grant proposal writing** — historical grant patterns (won and rejected) are mineable from a private namespace.
4. **Team supervision artefacts** — concept and position pages survive PhD turnover; a new student gets a curated entry point.
5. **Teaching prep** — for ELEC ENG 4087/7087 and similar units, lecture material is grounded in your own work.

Phase 1 is single-user. The data model accommodates a future team layer with no migration; team plumbing is intentionally not built.

---

## 3. Where to find it in the app

The wiki lives in its own workspace. Click the **Wiki** button in the left sidebar (or the wiki entry on mobile) and the main panel switches to the **Wiki Workspace**. The workspace has eight tabs along the top:

| Tab | What it is |
|---|---|
| **Inbox** | Pending proposals to review, lint findings, stale page flags, recovery actions |
| **Quality** | The five-metric quality dashboard, with Phase 3 extensions (theme coverage, bootstrap progress, mid-bootstrap migration trigger, Phase 3 report button) |
| **Bootstrap** | The Phase 3 bootstrap plan: own papers, external anchors, themes, order, and ingestion status |
| **Pages** | Read-only browser for committed wiki pages, grouped by type, with clickable ID wikilinks |
| **Grants** | Grant ingestion, outcome buckets, reviewer feedback, outcome notes, and related source documents |
| **Questions** | Open-question candidates clustered for promotion to canonical question pages |
| **Benchmark** | The synthesis-question benchmark runner (10 questions × 3 paths) |
| **Obsidian** | One-click read-only export to `_wiki_export_obsidian/` |

The active tab is remembered between sessions (stored in `localStorage` as `sv_wiki_workspace_tab`). Press the **×** in the workspace nav to return to the previous panel (PDF viewer, etc.).

The wiki does **not** require a separate ingest mode. You ingest papers from the same screen you read them on — the **paper-ingest button** in the top action bar (next to the PDF when a document is selected). When the selected document lives inside a folder you have marked as a grant folder, the same button switches automatically to a **G** grant-ingest action.

---

## 4. Setup checklist

Before the wiki can do anything useful:

1. **Connect storage** (Box or Dropbox) via Settings → Storage. The wiki will refuse to operate in demo mode.
2. **Configure at least one model provider.** The wiki defaults to Ollama for non-sensitive tasks; without it, you must enable a cloud provider in Settings (Claude, OpenAI, or Gemini). Sensitive content (grant pages) is Ollama-only by policy and is **never** sent to a cloud provider.
3. **Optional but recommended:** install [Ollama](https://ollama.com) locally and pull a synthesis-grade model (e.g. `llama3.3:70b` or `qwen2.5:32b`) and an embedding model (`nomic-embed-text`). With local models, routine paper ingestion costs $0; verifier passes on high-impact claims fall back to a small cloud model.
4. **Decide on themes.** Before bootstrapping (see §7), have a list of 5–8 research themes you want the wiki to cover. The wiki does not auto-cluster — themes are user-defined.

The wiki creates `_wiki/` lazily on first ingestion. Nothing to scaffold.

---

## 5. Workflow A — Ingest a paper

This is the most common operation.

1. Select a PDF in the document list.
2. Click the **paper-ingest** button in the top action bar (the icon shows a folded page with a plus). For a grant-folder document, the same button shows **G** and routes to grant ingestion (see §9).
3. Check the **metadata pre-flight** modal. Correct obvious title, year, DOI, author, funder, program, or submitted-year problems before the wiki page or proposal is created. This is where you catch joined strings such as `Round 182025`.
4. The pipeline runs in the background:
   - Reads PDF text via PDF.js.
   - Reads `pages.json` and `aliases.json` to find candidate concept pages this paper might touch.
   - Routes the extraction call: Ollama-first; falls back to a cloud provider only if local is unavailable and the document is not sensitive.
   - Generates a structured proposal: a paper page plus updates to listed concept/method/dataset pages, with claims and evidence locators (PDF page + char range + page-text hash).
   - Runs a **verifier pass** on every claim flagged high-impact: a frontier model is asked whether the quoted evidence supports the claim. Unsupported claims are kept in the proposal as `do_not_apply` so you can see why they were filtered.
   - Writes the proposal to `_wiki/_proposals/prop_<ulid>.json`.
5. The proposal appears in the **Inbox** tab. The workspace does not auto-open — switch to it when you are ready to review.

**Re-ingesting the same paper is idempotent** — the proposal builder produces the same shape from the same input, so nothing duplicates.

**If the paper is large** (over the local model's context window): the pipeline chunks the page text and preserves locators per page. If neither local nor cloud can handle it safely, ingestion fails with a clear error rather than silently truncating.

**If you are in safety mode** (see §13): ingestion is blocked. Resolve the underlying issue first.

---

## 6. Workflow B — Review proposals in the Inbox

The Inbox tab is the queue you work through. From the Phase 2 spec, the design target is **under 5 minutes per normal paper** (no high-risk pages).

**Top of the inbox shows:**

- **State badge** (`Normal` or `Safety mode`).
- **Stat chips**: pending proposal count · lint finding count · stale page count · pending-op count. Click any chip to filter to that section.
- **Cost summary** for the current month with the configured cap.
- **Review-debt banner** — when pending review minutes exceed the threshold, new ingestion is auto-paused. Clear the queue or use the manual override.

**Each proposal card shows:**

- Source title and DOI.
- **Risk-tier counts** as `H/M/L` badges:
  - **High-risk** changes touch contested claims, conflicting evidence, or policy-sensitive content. They require full review.
  - **Medium-risk** changes touch concept pages with existing claims. One-click approval is allowed.
  - **Low-risk** changes are mechanical (new wikilinks, claim additions to thin pages). They are auto-collapsed with a random-audit sample shown.
- Age of the proposal.

**Inside the proposal review:**

- **Side-by-side diff** per page change.
- **Source-evidence viewer**: click any claim's locator to jump into the PDF at the exact page/character range. The page-text hash is verified — if the PDF has changed since extraction, you get a stale-locator warning.
- **Per-change actions**: accept, edit, or reject. Edits stay in the proposal until you accept the whole proposal.
- **Batch low-risk approval** with audit sampling: the system surfaces a random sample of low-risk changes before bulk-applying.
- **Verifier-unsupported claims** appear in the high-risk section with `canonical_action: do_not_apply` so you can see the exact text and the verifier's verdict.

**Keyboard shortcuts** (focus a proposal card first):

- `j` / `k` — next / previous proposal.
- `Enter` — open the focused proposal.
- Inside the proposal: `?` opens the shortcut overlay.

**On accept**, the system:

1. Validates that every wikilink is ID-based (alias-style links are rejected).
2. Writes a pending op file (`_wiki/_ops/YYYY/MM/op_<ulid>.pending.json`).
3. Re-reads each affected page; checks the base hash against the proposal's expected hash; attempts a rebase if needed.
4. Writes each page with a conditional `writeTextIfRevision` (atomic CAS).
5. Regenerates sidecars.
6. Writes a committed op file (`op_<ulid>.committed.json`).
7. Moves the proposal to `_wiki/_proposals/_archived/`.

If anything fails between steps 3 and 5, the system enters **safety mode** and the inbox surfaces a recovery action (see §13).

**Stale-pages section** at the bottom of the Inbox lists pages older than 90 days without human review — these are candidates for a refresh ingestion.

---

## 7. Workflow C — Bootstrap a corpus (Phase 3)

This is how you go from "1 paper ingested" to "wiki rich enough for chat to be useful."

Phase 3 is the **controlled bootstrap**: you manually pick 25–30 of your most-cited or most-thematically-central papers, plus 10–15 external anchor papers. You ingest them one by one through the same review surface. Own-papers go first to establish your vocabulary and concept boundaries; external anchors layer authoritative cross-references onto that established structure.

**The bootstrap plan** lives at `_wiki/_phase3/bootstrap_plan.json`. It records:

- `own_papers` — the 25–30 you authored, ordered, tagged with a theme.
- `external_anchors` — the 10–15 foundational external papers, ordered, tagged with a theme + `why_anchor`.
- `themes` — the user-defined theme list.
- `targets` — bootstrap size targets (default 25–30 own, 10–15 external).
- Schema-revision flag and at-paper marker.

Open the **Bootstrap** tab to manage this plan in the app. The tab shows own-papers and external anchors with theme tags, order controls, ingestion status (queued / in-progress / ingested / deferred), and a progress bar at top. External anchors are blocked from ingestion while any own-paper is still queued.

**Sequencing matters:**

1. Add 25–30 own-papers to the plan, order them by importance to your work.
2. Ingest them through the normal paper-ingest button. Each paper gets routed with **bootstrap-aware context**: the extraction prompt is augmented with whether the paper is yours, what theme it belongs to, what other papers in the same theme have already been ingested, and whether this is the first paper in the theme (`first_in_theme`), a subsequent paper (`subsequent_in_theme`), or an external anchor.
3. After paper 15, the **Quality dashboard** surfaces a one-shot **Mid-bootstrap schema revision check** banner. This is the last chance to migrate the schema before Phase 5. Either run a guided revision or skip — once skipped, the option is closed for the rest of Phase 3.
4. Continue ingesting the remaining own-papers and the external anchors.

**Pacing note from the design.** Phase 3 is the most demanding phase in terms of sustained attention. 35–45 papers × ~5 minutes review each is roughly 3–4 hours of focused review. **5 papers per evening over 8 evenings is sustainable; 15 papers in one weekend afternoon is not.** If a particular theme produces concept pages you find unhelpful when you actually use them, pause that theme and revisit — pushing through a broken theme accumulates noise that is hard to clean up later.

**Lint runs automatically every 5 ingestions** during the bootstrap (configurable in code via `LintScheduler.options.ingestion_interval`). Findings appear in the Inbox.

---

## 8. Workflow D — Read the Quality dashboard

The Quality tab tracks five metrics derived from your ingestion checklists, each with a green/amber/red threshold. In Phase 1 mode the thresholds are loose (10-paper trial); in Phase 3 mode they tighten.

| Metric | Phase 1 threshold | Phase 3 threshold |
|---|---|---|
| High-impact claim rejection rate | ≤ 20 % | ≤ 15 % |
| Average review time (normal papers) | ≤ 10 min | ≤ 4 min |
| Schema breaking migrations | ≤ 1 | 0 (after the mid-phase opportunity) |
| Concept-page usefulness average (1–5) | ≥ 3 | ≥ 3.5 |
| Manual cleanup rate | ≤ 10 % | ≤ 5 % |

Each metric card shows the current value, the trend over the last 5 papers, the threshold, the sample size, and a status badge.

When any threshold is crossed, ingestion **auto-pauses** and the dashboard prompts for a decision: continue with override (logged with justification), run a schema revision, or step back.

**Phase 3 extensions** (visible when you set `phase="phase3"` in the dashboard props, or implicitly once the bootstrap plan exists):

- **Mid-bootstrap migration banner** at paper 15 (see §7).
- **Cost-projection warning** when projected total spend exceeds the Phase 3 upper bound.
- **Bootstrap progress** — own-papers ingested / target, external anchors / target, statuses.
- **Per-theme coverage table** — papers ingested, concept pages created, well-supported (≥3 papers) concept pages, per theme.
- **Cross-paper coherence (top concepts)** — for the top 10 most-linked concept pages: supporting paper count, claim count, avg supporting papers, stddev claim count.
- **Generate Phase 3 report** button — emits `_wiki/_phase3/PHASE_3_REPORT.md` with summary, per-theme structure, wiki state, quality metrics, cost projection, overrides, and a **Phase 5 readiness check** scoring each of the nine [DEC-19] gates as pass / trending / fail / pending.

The Phase 3 report is the input to deciding whether to proceed to Phase 4. The exit criterion is **at least 8 of 9 quality gates passing or trending**.

---

## 9. Workflow E — Mark a grant folder + ingest grants

Grants are sensitive. They live in a private namespace (`_wiki/_private/grant/`) and are **Ollama-only by policy** — no cloud provider sees them.

1. **Mark a folder as a grant folder.** Right-click any folder in the FolderTree and choose **Mark as grant folder**. A "Grant" badge appears next to the folder name. Marking is recursive — every document inside, including in nested subfolders, is now treated as a grant document.
2. **Ingest grant documents.** With a document inside a grant folder selected, the paper-ingest button in the top action bar shows **G** instead of the usual icon. Click it. The metadata pre-flight modal opens first so you can correct title, funder, program, and submitted year. The pipeline:
   - Routes the extraction through `GrantNamespacePolicy` which blocks any cloud provider.
   - Extracts PDF text and asks local Ollama for a structured `Generated Application Summary`. If Ollama is unavailable, ingestion fails clearly and no grant page is created.
   - Writes the resulting page to `_wiki/_private/grant/`.
   - Updates `library.json` so the document records `wiki.grant_page_id`, `grant_page_path`, `grant_ingested_at`.
   - Switches the wiki workspace to the **Grants** tab so you can see the result.
3. **The Grants tab** lists all un-ingested grant documents detected in your library. Each row has an **Ingest grant** button that runs the same pipeline. Existing grant pages are grouped into outcome buckets: pending, under_review, won, rejected, withdrawn, and other.
4. **Update outcomes and feedback.** Open a grant card, choose the outcome, paste reviewer feedback, and add outcome notes. Save re-reads the page after writing so the form reflects the committed state.
5. **Attach related source documents.** Use **Attach related document** to connect outcome notices, reviewer feedback files, budgets, support letters, appendices, or other grant-folder documents. Reviewer feedback and outcome notice files populate the matching editable section automatically; PDF files are summarised locally via Ollama, and text/markdown files are read directly.
6. **Archive mistaken entries.** If you accidentally ingest a document that is not a grant application, use **Archive entry** on the grant form. The page is hidden from the normal Grants view but remains in `_wiki/` with `archived: true` for audit and recovery.

Re-ingesting the same grant document is idempotent. ScholarLib checks `source_doc_id` and opens the existing grant page instead of creating a duplicate. If funder, program, submitted year, and title match another grant but the source document differs, ScholarLib warns before continuing.

To unmark a folder, right-click and choose **Unmark as grant folder**. Already-ingested grant pages remain in `_wiki/_private/grant/`.

**Lint rules include `grant_namespace_leakage`, `related_source_doc_unknown`, and `archived_target_missing`.** These catch grant content leakage, related documents that no longer exist in `library.json`, and archived pages whose `superseded_by` target is missing.

---

## 10. Workflow F — Curate open questions

During paper ingestion, the model can propose **open question candidates** (per [DEC-09]) — questions the paper raises but does not answer, things you might want to investigate. These are not full pages — they are records inside paper pages, surfaced for clustering.

The **Questions** tab shows clusters generated by `QuestionClusterer` from the candidates accumulated so far. For each cluster:

- The candidate questions, with the source paper page link.
- A **Promote to canonical question page** action that creates a `q_*` page.

This is a Phase 6+ feature. Only run it after enough papers are ingested (10+ recommended) for clustering to find structure.

---

## 11. Workflow G — Run a benchmark

The **Benchmark** tab runs the synthesis-question benchmark from [DEC-20]: a curated set of questions, answered by three paths (RAG-only, wiki-only, wiki+RAG), scored by you. The benchmark is the project's main empirical check on whether the wiki actually delivers.

To run:

1. The tab loads the benchmark question set from `_wiki/_benchmark/`.
2. For each question, the runner generates three answers with provenance metadata.
3. You score each answer for accuracy and synthesis quality.
4. Results are aggregated into a `_wiki/_benchmark/<date>.json` report.

Phase 5's exit criterion is that the wiki-assisted path **wins or ties** on the synthesis subset, confirmed by 2 weeks of real use. If the benchmark runs against and the wiki loses, the routing default reverts to RAG and the Phase 6+ work is reconsidered.

---

## 12. Workflow H — Export to Obsidian

The Obsidian export is a **read-only** mirror at `_wiki_export_obsidian/`. Obsidian (or Logseq) reads it; edits in Obsidian are discarded on the next regeneration.

To export: switch to the **Obsidian** tab and click **Export**. The exporter:

- Walks every canonical page.
- Rewrites `[[c_01JX...]]` ID-wikilinks to `[[handle|display title]]` for human readability.
- Strips internal-only frontmatter (content hashes, storage revisions).
- Converts `scholarlib-claim`, `scholarlib-evidence`, etc. fenced blocks to Obsidian admonitions.
- Generates an `index.md` and per-type indexes.
- Writes a `README.md` explaining the read-only policy.

Then point Obsidian at the synced `_wiki_export_obsidian/` folder. Recommended plugins: **Dataview** (for queries) and **Graph Analysis** (for the graph view).

To regenerate after new ingestions: re-click **Export**. The output is fully overwritten — there is no merge.

The Obsidian export is opt-in. Do not enable the after-each-ingestion variant during Phase 1–3 bootstrap (it will rewrite the export 35+ times).

---

## 13. Wiki-assisted chat (Phase 5)

Once Phase 5 ships, the Chat panel routes between three paths:

- **Wiki-only** — assemble context from `_wiki/` pages relevant to the query (concept, method, position, paper pages).
- **RAG-only** — current ScholarLib behaviour: chunk-level retrieval over selected scope.
- **Wiki + RAG** — wiki for synthesis, RAG for verification or extractive subqueries.

The route is chosen by an **intent classifier** (`IntentClassifier`) plus a multi-signal scorer per [DEC-17]. You can override per message.

**UI changes** (Phase 5):

- Two citation icon styles: PDF (📄) and wiki page (📝).
- Provenance badge per response: "from wiki" / "from PDFs" / "from both".
- **Save as candidate** affordance on every wiki-assisted answer. Saved candidates land in `_wiki/_inbox/chat-candidates/<date>-<slug>.json` and feed a future batch-promotion UI (Phase 7+).

The compounding mechanism is subtle. **Save-as-candidate is the only reason the wiki gets richer in steady state** (other than new ingestion). If you don't use it, the wiki freezes after the bootstrap and slowly becomes stale. If by week 2 of real use you have saved 3+ candidates per week and consult the wiki side-panel during writing, the project is succeeding.

Existing chat scopes (single-doc, folder, library, tag, collection) are preserved — folder-scope semantics are bit-identical to pre-Phase-4 [A-12].

---

## 14. Storage layout

Everything the wiki writes lives under your Box/Dropbox root.

```
/ScholarLib
├── _system/                          (existing — ScholarLib internals)
│   ├── library.json                  (canonical library)
│   ├── settings.json
│   ├── chat_history.json
│   └── index/                        (per-document embedding indexes)
├── PDFs/                             (existing — your uploaded PDFs)
└── _wiki/                            (the wiki)
    ├── WIKI_SCHEMA.md                (schema spec — every agent reads this)
    ├── concept/                      (c_* pages)
    ├── method/                       (m_* pages)
    ├── dataset/                      (d_* pages)
    ├── person/                       (pe_* pages)
    ├── paper/                        (p_* pages)
    ├── position/_drafts/             (po_* draft pages)
    ├── _proposals/
    │   ├── prop_<ulid>.json          (pending — you have not reviewed yet)
    │   └── _archived/                (accepted or rejected)
    ├── _ops/2026/04/
    │   ├── op_<ulid>.pending.json    (in-flight write)
    │   ├── op_<ulid>.committed.json  (durable record)
    │   └── _summary.json
    ├── _system/                      (auto-regenerated; do not edit)
    │   ├── pages.json
    │   ├── aliases.json
    │   ├── links.json
    │   ├── claims.json
    │   ├── sources.json
    │   ├── authors.json
    │   ├── ops-index.json
    │   ├── cost-index.json
    │   └── wiki_state.json           (state machine; safety mode persistence)
    ├── _phase1/                      (10-paper trial scaffolding)
    │   ├── checklists/
    │   ├── usefulness/
    │   ├── overrides/
    │   └── PHASE_1_REPORT.md
    ├── _phase3/                      (controlled bootstrap)
    │   ├── bootstrap_plan.json
    │   ├── lint_state.json
    │   ├── schema_revision_taken.json
    │   └── PHASE_3_REPORT.md
    ├── _cost/2026/04/                (immutable per-call cost records)
    ├── _private/grant/               (grant pages — Ollama-only)
    ├── _inbox/
    │   └── chat-candidates/          (Phase 5 saved answers)
    ├── lint-reports/
    │   └── 2026-04-28.md
    └── log.md                        (generated, human-readable)

/_wiki_export_obsidian/               (Phase 6 — generated read-only mirror)
```

Two top-level directories — `_wiki/` (canonical) and `_wiki_export_obsidian/` (read-only mirror) — never coexist as inputs to the wiki. The export is downstream and disposable.

---

## 15. Cost and quotas

With Ollama-default routing on a Mac that can run a synthesis-grade model:

| Operation | Typical cost |
|---|---|
| Routine paper ingestion (extract + summarise) | $0.00 (Ollama only) |
| Verifier pass on 1–2 high-impact claims | $0.02 – $0.05 (Sonnet) |
| Synthesis-heavy paper requiring frontier extraction | $0.15 – $0.30 |
| **Phase 1 bootstrap** (10 papers) | ~$1 – $3 cloud |
| **Phase 3 bootstrap** (35–45 papers) | ~$5 – $15 cloud |
| **Steady state** | ~$5 – $15 / month |

**Hard caps** (configured in Settings):

- Per-operation cap: **$2** default.
- Monthly cap: **$50** default.
- Grant-namespace cloud: **$0** (Ollama-only by policy).

If your local hardware cannot run a synthesis-grade model, expected steady-state rises to ~$30–$60/month and the app warns you at setup.

Costs are stored as **immutable per-call records** at `_wiki/_cost/YYYY/MM/cost_<ulid>.committed.json`, with a generated `cost-index.json` rollup. Nothing is read-modify-write — the same two-phase pattern as op files.

The Inbox top bar shows the current month's spend against the monthly cap. The Quality tab shows projected total spend in Phase 3 mode.

---

## 16. Safety mode and recovery

Safety mode is a **read-only state on detected wiki corruption**. Triggers include:

- Sidecar regeneration failure.
- Alias collision after normalization (two different page IDs map from the same alias key).
- Partial page-write success (some target pages written, others failed).
- Pending op file with no matching committed file after a configurable interval.
- Hash mismatch the rebase path could not resolve.
- Schema-block parse failure on a canonical page.

While in safety mode:

- No new ingestion runs.
- No proposals are accepted.
- No sidecars are regenerated.
- The Inbox shows the safety reason and a recovery action panel.

**To recover**, the Inbox surfaces three actions depending on the situation:

- **Run integrity check** — re-scans pages vs `pages.json` and surfaces individual issues.
- **Restore latest** — re-runs operation log recovery: scans pending ops, reconciles against live storage, archives abandoned operations or commits ones whose writes succeeded.
- **Accept overwrite** — regenerates sidecars from the current canonical state and exits safety mode. Use this when an external edit (a manual fix in Box's web UI) caused the trip and you have already verified the result is correct.

After any recovery action, the wiki state is reset to `Normal` and ingestion resumes.

A weekly lint pass writes findings to `_wiki/lint-reports/YYYY-MM-DD.md` and surfaces them in the Inbox. The lint rules are listed in [`SCHOLARLIB_WIKI_DESIGN_V2_1.md`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_DESIGN_V2_1.md) §6.8.

---

## 17. Phase status

The wiki is built in 8 phases. As of the latest commit:

| Phase | Topic | Status |
|---|---|---|
| 0A | Storage adapter, page store, sidecars, op files, safety mode | shipped |
| 0B | Single-paper ingestion spike with verifier and risk-tiering | shipped |
| 1 | 10-paper schema trial with kill/redesign gates | shipped |
| 2 | Inbox + ProposalReview UX with risk-tiered diffs | shipped |
| 3 | Controlled bootstrap (themes, dashboard extensions, lint cadence, Phase 3 report) | shipped |
| 4 | ChatOrchestrator extracted, RAG parity preserved | shipped |
| 5 | Wiki-assisted chat, multi-signal routing, save-as-candidate, benchmark | shipped |
| 6+ | Obsidian export, grant namespace, question clustering | shipped (subset) |
| UX recovery increment 1 | Pages browser, Bootstrap tab, grant form, grant PDF summaries, metadata pre-flight, archive schema | shipped |
| 7 | Gap finder, cross-pollinator, position synthesizer, save-from-chat batch UI | not started |
| 8 | Grant pattern miner | not started |

Increment 1 closed the main post-Phase-6+ usability gaps: committed pages are browsable in-app, bootstrap planning no longer requires a console, grant outcomes and reviewer feedback are editable from the Grants tab, related grant documents can be attached, grant PDF ingestion produces a labelled generated summary, and ingestion starts with a metadata pre-flight check.

If you discover other gaps as you use the wiki, please open an issue.

---

## 18. Phase notes — practical guidance from the build

These are the "Notes for the user" sections from each phase prompt, distilled. They are the design author's advice on how to actually use each phase.

**Phase 0B (first ingestion).** Inspect the proposal review surface critically. Does the risk tiering match your intuition? Are verifier rejections accurate? How long did the review actually take? Mock-based tests do not tell you whether the prompts produce sensible verifications on real claims.

**Phase 1 (10-paper trial).** Expected duration is **3–7 days of intermittent work**, not a single marathon. One paper per evening, with a real writing session between papers to generate genuine usefulness signal. **If you find yourself rushing to complete the trial faster, that is the signal to slow down.** If by paper 3 review times are over 15 minutes, claim rejection is high, and position drafts feel unusable, **abort** — running 10 papers through a broken schema produces 10 papers' worth of mess.

**Phase 2 (review UX).** The 5-minute target matters. If reviewing one paper still takes 10 minutes after the polished surface ships, Phase 3 will not be tolerable. Iterate on UX before Phase 3, not after. Keyboard shortcuts are the single largest time saver — if you reach for the mouse, a shortcut is missing.

**Phase 3 (controlled bootstrap).** 5 papers per evening over 8 evenings is sustainable; 15 papers in one weekend afternoon is not. The mid-bootstrap migration opportunity at paper 15 is the most consequential decision in this phase. If you observe consistent schema problems, fix them. If only minor issues, skip — bumping schema late in a bootstrap creates churn for limited gain. External anchors are the moment the wiki stops being "just my work" and becomes a research tool. Pick them carefully.

**Phase 4 (orchestrator).** The single most important property of Phase 4 is that **you do not notice it shipped**. If anything in chat feels different, the refactor introduced a bug — file it, do not accept the new behaviour. Run 5 real sessions on real content; synthetic queries miss streaming-quality regressions.

**Phase 5 (wiki-assisted chat + benchmark).** Score the benchmark **honestly**. The system can handle a benchmark loss by defaulting to RAG; what it cannot handle is a benchmark won by advocacy that produces sustained dissatisfaction. If by week 2 of real use you have forgotten the wiki exists, that is the signal to step back and reconsider Phase 6+.

**Phase 6+ (post-trust extensions).** These exist because of compounding value, not because they are necessary. The wiki is already useful at end of Phase 5. If life gets busy and Phase 6+ never ships, the project is still a success. **The grant pattern miner (Phase 8) is the single most valuable feature in this entire project for a researcher with ongoing grant volume and rejection history. If only one Phase 6+ feature ships, make it that.**

---

## 19. Glossary

| Term | Meaning |
|---|---|
| Canonical page | Markdown file in `_wiki/<type>/` — the source of truth |
| Candidate | A chat answer the user marked as worth filing (Phase 5+) |
| Chat candidate | A saved chat answer, in `_wiki/_inbox/chat-candidates/`, awaiting batch promotion |
| Compounding | Wiki property: gets richer with use as candidates are saved |
| Concept page | Wiki page for a domain idea, aggregating across papers |
| Committed op | Operation file written *after* successful page writes + sidecar regen |
| Fenced block | Markdown ```scholarlib-* ``` block carrying structured records (claim, evidence, etc.) |
| Handle | Mutable human-readable slug; not the page identity |
| ID | Immutable opaque ULID with type prefix; used in canonical wikilinks |
| Ingestion | Read source PDF → produce proposal |
| Lint | Periodic health check producing findings surfaced in the Inbox |
| MemoryAdapter | In-memory mock storage adapter for tests; never used in the running app |
| Ollama | Local LLM runtime; default for non-sensitive tasks |
| Operation file | Immutable per-op record; primary audit substrate |
| Pending op | Operation file written *before* page writes; reconciled at recovery |
| Position page | Synthesis page in your voice; state-tracked via `voice_status` |
| Proposal | Structured edit set produced by ingestion, awaiting your review |
| RAG | Existing chunk-level retrieval pattern; preserved alongside wiki |
| Risk tier | Deterministic classification of a proposed change: low / medium / high |
| Safety mode | Read-only state on detected wiki corruption |
| Sidecar | Generated JSON index in `_wiki/_system/`; never hand-edited |
| Theme | User-defined research area; bootstrap entries are tagged with a theme |
| ULID | Universally unique lexicographically sortable identifier |
| Verifier | Frontier-model pass that checks whether evidence supports a high-impact claim |
| Wikilink | `[[<id>]]` reference between pages — IDs only in canonical pages |

---

## 20. Where to read more

Source-of-truth documents at the repository root:

- [`SCHOLARLIB_WIKI_DESIGN_V2_1.md`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_DESIGN_V2_1.md) — the design contract. §4 lists every architectural decision (`[DEC-NN]`) and amendment (`[A-NN]`). §5 is the storage layout. §6 is the schema spec. §7 is the ingestion pipeline. §8 is chat integration. §10 is the phase plan.
- Per-phase build prompts: [`PHASE_0A`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_0A_PROMPT.md) · [`0B`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_0B_PROMPT.md) · [`1`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_1_PROMPT.md) · [`2`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_2_PROMPT.md) · [`3`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_3_PROMPT.md) · [`4`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_4_PROMPT.md) · [`5`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_5_PROMPT.md) · [`6+`](https://github.com/pourmousavi/ScholarLib/blob/main/SCHOLARLIB_WIKI_PHASE_6_PLUS_PROMPT.md). Each contains its own "Notes for the user" section and exit criteria.
- [Cross-phase addendum](https://github.com/pourmousavi/ScholarLib/blob/main/scholarlib-wiki-phase-prompts-final-addendum.md) — corrections that apply to every phase prompt.

Project docs:

- [`README.md`](https://github.com/pourmousavi/ScholarLib/blob/main/README.md) — top-level project overview.
- [`CLAUDE.md`](https://github.com/pourmousavi/ScholarLib/blob/main/CLAUDE.md) — build guide for AI coding tools.
- [`docs/ARCHITECTURE.md`](https://github.com/pourmousavi/ScholarLib/blob/main/docs/ARCHITECTURE.md) — overall ScholarLib architecture (the wiki sits on top of this).
- [`docs/USER_SETUP.md`](https://github.com/pourmousavi/ScholarLib/blob/main/docs/USER_SETUP.md) — Box/Dropbox account setup, API keys.
- [`docs/LIBRARY_SCHEMA.md`](https://github.com/pourmousavi/ScholarLib/blob/main/docs/LIBRARY_SCHEMA.md) — `library.json` schema (the wiki reads this, never writes it).
- [Obsidian setup](/wiki/obsidian-setup) — pointing Obsidian at the read-only export.
