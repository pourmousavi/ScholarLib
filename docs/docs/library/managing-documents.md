---
sidebar_position: 1
---

# Managing Documents

Learn how to add, organize, and manage documents in your ScholarLib library.

## Creating Folders

- Right-click in the sidebar → "New Folder"
- Or use the context menu on an existing folder
- Folders can be nested for organization

## Adding Documents

### Drag & Drop

Drop PDF files onto a folder or the document list.

### Upload Button

Click the upload area in an empty folder.

:::info Automatic Metadata
Metadata is automatically extracted from PDFs when you add them.
:::

## Metadata Extraction

ScholarLib uses multiple sources to extract paper metadata:

1. **DOI Lookup:** If a DOI is found, fetches from CrossRef
2. **GROBID:** ML-based extraction with 90%+ accuracy
3. **AI Extraction:** Fallback using your configured AI
4. **OpenAlex:** Enriches with citation counts and open access links

## Editing Metadata

1. Right-click a document → "Edit Metadata"
2. Manually correct title, authors, journal, etc.
3. Click "Re-extract with AI" to try extraction again

## Re-indexing Documents

- Right-click a document → "Re-index for AI"
- Useful after switching to a better AI/embedding model
- Re-generates document chunks and embeddings for improved AI chat

## Tagging Documents

- Right-click a document → "Manage tags..." to assign tags
- Create and manage tags in the **TAGS** section of the sidebar
- See the [Tags](/library/tags) section for detailed tag usage

## Search

Use the search box at the top of the sidebar to find documents by title, author, journal, or keywords.

:::tip Keyboard Shortcut
Press <kbd>Cmd/Ctrl</kbd> + <kbd>K</kbd> to quickly focus the search box.
:::
