---
sidebar_position: 6
---

# Settings Guide

Access Settings via the gear icon at the bottom of the sidebar.

## AI & Models

| Setting | Description |
|---------|-------------|
| **Provider** | Choose WebLLM, Ollama, Claude, OpenAI, or None |
| **Model** | Select specific model (varies by provider) |
| **API Keys** | Enter keys for cloud providers (stored locally only) |

:::info API Key Security
Your API keys are stored only in your browser's local storage. They are never sent to our servers or stored in your cloud storage.
:::

## Storage

| Setting | Description |
|---------|-------------|
| **Provider** | Shows current Dropbox or Box connection |
| **Disconnect** | Sign out (data remains in cloud) |
| **Import from Zotero** | Import your Zotero library (collections, tags, notes, PDFs) |
| **Export Library Bundle** | Export your library for migration to another storage provider |
| **Import Library Bundle** | Import a previously exported ScholarLib bundle |

:::tip Migrating from Zotero?
Click **Import from Zotero** to launch the import wizard. See the [Importing from Zotero](./import.md) guide for detailed instructions.
:::

## Metadata

### Extraction Mode

| Mode | Behavior |
|------|----------|
| **Auto** | Extract and save automatically |
| **Review** | Show for review before saving |
| **Manual** | Don't auto-extract |

### Metadata Sources

Toggle which sources to use:
- GROBID
- OpenAlex
- CrossRef
- Semantic Scholar
- AI

### GROBID Endpoint

- **HuggingFace** (recommended)
- **ScienceMiner**

## Appearance

| Setting | Description |
|---------|-------------|
| **Theme** | Dark or Light mode |
| **Show Document Counts** | Toggle folder document counts in sidebar |
| **Show Tags** | Display your assigned tags on document cards |
| **Show Keywords** | Display paper keywords (from metadata) on document cards |
| **Font Size** | Normal or Large (scales all text) |
| **PDF Default Zoom** | Initial zoom level when opening PDFs (75-150%) |

## Export & Privacy

| Setting | Description |
|---------|-------------|
| **Default Format** | Markdown, Text, PDF, or Word |
| **Clear Chat History** | Delete all saved conversations |
| **Re-index All** | Rebuild the search index for all documents |
| **Remove Orphaned Documents** | Clean up library entries whose PDF files no longer exist in storage |

:::warning Destructive Actions
"Clear Chat History" and "Remove Orphaned Documents" cannot be undone. Make sure you have exported any important data before using these options.
:::
