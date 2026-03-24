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

## Danger Zone

:::danger Irreversible Actions
The actions in this section permanently delete data and cannot be undone.
Make sure you have exported any important data before using these options.
:::

### Delete All Tags

Removes all tags from your library.

| Deletes | Preserves |
|---------|-----------|
| All tags from registry | Folders |
| Tags from all documents | Documents & PDFs |
| **All collections** (they depend on tags) | |

**Why collections are also deleted:** Collections use tags for smart filtering. Without tags, collections become non-functional and are automatically removed.

**Shared items:** If any tags or collections were shared with collaborators, their access will be revoked.

**Confirmation:** Type `DELETE TAGS` to confirm.

---

### Delete All Collections

Removes all collections from your library.

| Deletes | Preserves |
|---------|-----------|
| All collections | Tags |
| | Folders |
| | Documents & PDFs |

**Shared items:** If any collections were shared with collaborators, their access will be revoked.

**Confirmation:** Type `DELETE COLLECTIONS` to confirm.

---

### Delete All Folders & Documents

Removes all folders and documents, including PDF files from your cloud storage.

| Deletes | Preserves |
|---------|-----------|
| All folders | **Tags** (for reuse in future imports) |
| All documents | |
| All PDF files from storage | |
| **All collections** (they reference documents) | |

**Why collections are also deleted:** Collections reference documents either directly or through tags. Without documents, collections become empty and are automatically removed.

**Why tags are preserved:** Tags can be reused when you import new documents, saving you from recreating your tagging taxonomy.

**Shared items:** If any folders or collections were shared with collaborators, their access will be revoked.

**Confirmation:** Type `DELETE LIBRARY` to confirm.

---

### Reset Everything

Complete library reset - removes all data and returns to a fresh state.

| Deletes | Preserves |
|---------|-----------|
| All tags | Nothing |
| All collections | |
| All folders | |
| All documents | |
| All PDF files from storage | |

**Shared items:** All sharing relationships will be terminated and collaborator access revoked.

**Confirmation:** Type `RESET EVERYTHING` to confirm.

:::tip After Reset
After a full reset, your library will be empty. You can:
- Import from Zotero to rebuild your library
- Start fresh by uploading new PDFs
- Your cloud storage connection remains active
:::
