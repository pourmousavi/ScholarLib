---
sidebar_position: 4
---

# Citation Export

Export citations for your documents in multiple academic formats. Whether you're writing in LaTeX, using a reference manager, or need formatted citations for Word documents, ScholarLib has you covered.

## Supported Formats

| Format | Extension | Best For |
|--------|-----------|----------|
| **BibTeX** | .bib | LaTeX, Overleaf, JabRef |
| **RIS** | .ris | Zotero, Mendeley, EndNote (universal) |
| **CSL-JSON** | .json | Pandoc, modern markdown workflows |
| **EndNote XML** | .xml | EndNote, institutional systems |
| **APA 7th** | .txt | Psychology, social sciences |
| **MLA 9th** | .txt | Humanities, literature |
| **Chicago 17th** | .txt | History, arts, publishing |
| **Harvard** | .txt | UK/Australian universities |

## How to Export Citations

You can export citations from multiple places in ScholarLib:

### Single Document

Right-click any document → "Export citation..."

### Multiple Documents (Bulk)

Select multiple documents using checkboxes, then click "Export Citations" in the action bar.

### Entire Folder

Right-click a folder → "Export all citations..."

### All Documents with a Tag

Right-click a tag → "Export citations..."

### All Documents in a Collection

Right-click a collection → "Export citations..."

## Using the Export Modal

1. Choose your desired format using the format tabs at the top
2. Preview the generated citations in the preview area
3. Click **Copy to Clipboard** to copy the citations
4. Or click **Download** to save as a file

## Format Details

### BibTeX (.bib)

Standard format for LaTeX documents. Each entry includes a cite key (e.g., `zhang2024calendar`) that you can use with `\cite{zhang2024calendar}` in your LaTeX source.

```bibtex
@article{zhang2024calendar,
  author = {Zhang, Y. and Chen, L.},
  title = {Calendar Aging Model...},
  journal = {Applied Energy},
  year = {2024},
  doi = {10.1016/j.apenergy.2024.01.042}
}
```

### RIS (.ris)

Universal format supported by virtually all reference managers including Zotero, Mendeley, EndNote, and Papers. Best choice when sharing with collaborators who use different tools.

### CSL-JSON (.json)

Modern JSON-based format used by Pandoc and citation.js. Ideal for automated workflows and markdown-based writing systems.

### Formatted Citations (APA, MLA, Chicago, Harvard)

Ready-to-use formatted text citations. Perfect for pasting directly into Word documents, Google Docs, or any text editor. Each citation is fully formatted according to the style guide.

## Tips

:::tip Best Practices
- For best results, ensure your documents have complete metadata (authors, year, journal, DOI)
- Use "Edit Metadata" to fix any missing or incorrect information before exporting
- BibTeX and RIS files can be imported directly into Zotero, Mendeley, or EndNote
- When exporting many documents, the preview may take a moment to generate
- DOIs are automatically converted to URLs in formatted citation styles
:::

## Missing Metadata Handling

When metadata is incomplete, ScholarLib uses sensible defaults:

| Missing Field | Default Value |
|---------------|---------------|
| Authors | "Unknown Author" |
| Year | "n.d." (no date) |
| Title | Filename (without .pdf extension) |
| DOI | DOI field is omitted |
