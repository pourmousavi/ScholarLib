---
sidebar_position: 2
---

# Switching Storage Providers

Moving from Dropbox to Box, or vice versa? This guide explains how to migrate your entire ScholarLib library to a new storage provider.

## When to Migrate

- Switching from personal Dropbox to university Box account
- Moving to a storage provider with more space
- Consolidating storage across services

## What Gets Preserved

| Data | Preserved |
|------|-----------|
| Folder Structure | ✓ All your folders and their hierarchy |
| Document Metadata | ✓ Titles, authors, DOIs, journals, years |
| Notes & Annotations | ✓ All your notes for each document |
| Chat History | ✓ All AI conversations with their document references |
| Tags & Stars | ✓ Your document tags, stars, and read status |

## What Needs Rebuilding

**Vector search indexes** — These need to be regenerated after import. Use "Re-index all documents" in Settings after importing.

## Step 1: Export Your Library

1. Go to **Settings → Storage**
2. Scroll down to the **Migration** section
3. Click **Export Library Bundle**
4. Review the export summary (folders, documents, notes, conversations)
5. Click **Download Bundle**
6. Save the `.scholarlib` file somewhere safe

## Step 2: Transfer Your PDFs

PDFs are not included in the bundle to keep the file size manageable. Transfer them separately:

### Option A: Desktop Apps (Recommended)

If you have both Dropbox and Box desktop apps installed, simply drag the `ScholarLib/PDFs` folder from one to the other.

### Option B: Web Interface

Download your PDFs folder as a ZIP from the old provider's website, then upload and extract it in the new provider.

### Option C: Cloud Transfer Tools

Services like MultCloud, Mover.io, or similar can transfer files directly between cloud providers without downloading locally.

## Step 3: Connect to New Provider

1. In ScholarLib, go to **Settings → Storage**
2. Click **Disconnect** to sign out of the current provider
3. You'll be taken to the provider selection screen
4. Connect to your new provider (Box or Dropbox)
5. Authorize ScholarLib to access the new account

## Step 4: Import Your Library

1. Make sure your PDFs are in the `ScholarLib/PDFs/` folder on the new provider
2. Go to **Settings → Storage**
3. Click **Import Library Bundle**
4. Select your `.scholarlib` file
5. ScholarLib will scan for PDFs and match them to your documents
6. Review the matching results:
   - **Green** — PDF found, ready to import
   - **Yellow** — PDF not found (you can add it later)
7. Click **Import Library**

## Step 5: Re-index Documents

After importing, rebuild the AI search index:

1. Go to **Settings → Export & Privacy**
2. Click **Re-index all documents**
3. Wait for indexing to complete (shown in the sidebar)

## Troubleshooting

### "No PDFs found"

Make sure your PDFs are in a folder called `PDFs` inside the `ScholarLib` folder. The structure should be: `ScholarLib/PDFs/your-papers.pdf`

### "Some documents missing PDFs"

This is okay! Documents will be imported with their metadata intact. You can upload the missing PDFs later and they'll automatically reconnect.

### "Import replaced my existing library"

Import always replaces existing data. If you need to merge libraries, export your current library first, then manually combine the folders.
