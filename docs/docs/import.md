---
sidebar_position: 7
---

# Importing from Zotero

Migrate your entire Zotero library to ScholarLib, including documents, folders, tags, notes, and PDF annotations.

## Before You Start

### In Zotero

1. Open Zotero
2. Select the collections/items you want to export (or select "My Library" for everything)
3. Go to **File → Export Library...**
4. Choose **Zotero RDF** as the format
5. Check these options:
   - ✅ Export Notes
   - ✅ Export Files (to include PDFs)
6. Click **OK** and save to a location you can find

This creates:
- A `.rdf` file with your metadata, tags, and notes
- A folder containing your PDF files

:::tip Large Libraries
For libraries over 500 items, consider exporting collections separately to make the import more manageable.
:::

## Import Wizard

### Step 1: Select Source

1. In ScholarLib, go to **Settings → Import Library**
2. Select **Zotero RDF** as the source type
3. Click **Choose File** and select your `.rdf` file
4. (Optional) Click **Choose Folder** and select the folder containing your PDFs

:::info Attachments Folder
The attachments folder is optional. If you include it, ScholarLib will upload your PDFs to your cloud storage. Without it, only metadata is imported.
:::

### Step 2: Review Scan Results

The wizard shows what was found in your export:

| Item | Description |
|------|-------------|
| **Documents** | Number of papers/items to import |
| **Collections** | Folder structure from Zotero |
| **Tags** | All tags used in your library |
| **PDFs** | Attachments that will be uploaded |
| **Notes** | Attached notes from Zotero |

#### Import Options

- **Import folder structure** — Create folders matching your Zotero collections
- **Import tags** — Add all your Zotero tags to ScholarLib
- **Import notes** — Convert Zotero notes to ScholarLib notes (HTML → Markdown)
- **Extract PDF annotations** — Pull highlights and comments from PDF files

### Step 3: Map Collections to Folders

Choose where each Zotero collection should go:

- **Create new folder** — A new folder is created with the same name
- **Use existing folder** — Map to a folder already in ScholarLib
- **Library Root** — Import directly into the root level

:::tip Default Folder
Set a default folder for items that aren't in any collection.
:::

### Step 4: Review Duplicates

ScholarLib detects potential duplicates by comparing:

| Method | Confidence | Description |
|--------|------------|-------------|
| DOI match | 100% | Exact DOI match |
| Title match | 90% | Exact title match |
| Similar title | 85% | Fuzzy title matching |
| Title + Year + Author | 80% | Combined metadata match |

For each duplicate, choose how to handle it:

- **Skip** — Keep existing document, don't import
- **Import anyway** — Import as a separate document
- **Replace** — Replace existing document with imported version
- **Merge metadata** — Combine metadata from both (fills in missing fields)

### Step 5: Import Progress

The import runs with progress updates:

1. Creating folders
2. Registering tags
3. Importing documents
4. Uploading PDFs
5. Extracting annotations
6. Converting notes

:::info Large Imports
Large libraries may take several minutes. Don't close the browser window during import.
:::

### Step 6: Import Complete

Review your import results:

- ✓ Documents imported
- ✓ Folders created
- ✓ Tags added
- ✓ PDFs uploaded
- ✓ Annotations extracted
- ✓ Notes converted

## What Gets Imported

### Metadata

| Zotero Field | ScholarLib Field |
|--------------|------------------|
| Title | title |
| Authors | authors (first/last names) |
| Date | year |
| Publication | journal |
| Volume/Issue | volume, issue |
| Pages | pages |
| DOI | doi |
| Abstract | abstract |
| Tags | tags |
| Item Type | type |

### Collections → Folders

- Zotero collections become ScholarLib folders
- Nested collections maintain their hierarchy
- Items in multiple collections are placed in the first one

### Tags

- All tags are imported to the tag registry
- Tags maintain their names
- Colors are assigned from ScholarLib's palette

### Notes

- Zotero notes are converted from HTML to Markdown
- Notes are attached to their parent documents
- Formatting is preserved where possible

### PDF Annotations

If you check "Extract PDF annotations":

1. Each imported PDF is scanned for embedded annotations
2. Highlights, underlines, and text notes are extracted
3. Colors are preserved
4. Comments are imported as annotation notes

:::note Zotero PDF Reader
If you used Zotero's built-in PDF reader, your annotations are embedded in the PDF files and will be extracted. External annotations stored only in Zotero's database cannot be imported.
:::

## After Import

### Index for AI

After importing, you'll want to index your documents for AI chat:

1. Select the imported documents or folder
2. Right-click → **Index for AI**
3. Or go to **Settings → Index All Documents**

### Verify Import

Spot-check a few documents:

1. Open a document and verify metadata looks correct
2. Check that PDF annotations appear
3. Open notes and verify content converted properly
4. Try AI chat to confirm indexing works

## Troubleshooting

### Missing PDFs

If PDFs weren't imported:

- Verify you selected the attachments folder
- Check that PDFs are in the folder Zotero exported
- For linked files, the original file locations must be accessible

### Incorrect Metadata

If metadata looks wrong:

- Right-click the document → **Edit Metadata**
- Click **Re-extract with AI** to try automatic extraction
- Manually correct any remaining issues

### Missing Annotations

If PDF annotations didn't import:

- Verify you checked "Extract PDF annotations"
- Annotations must be embedded in the PDF (not just stored in Zotero's database)
- Try opening the PDF in another reader to confirm annotations exist

### Import Errors

If items failed to import:

- Check the import summary for error details
- Common issues: invalid file paths, permission errors
- Try importing failed items separately

## Coming Soon

Additional import sources planned for future releases:

- **BibTeX** — Import from `.bib` files
- **Mendeley** — Import via Mendeley export
- **EndNote** — Import from EndNote libraries
- **Papers** — Import from Papers app

:::tip Mendeley Users
Mendeley encrypts its database, making direct import difficult. We recommend first importing your Mendeley library into Zotero, then exporting from Zotero to ScholarLib.
:::
