---
sidebar_position: 2
title: Obsidian Setup
description: Point Obsidian at the read-only wiki export for graph view and mobile reading.
---

# Obsidian Setup For ScholarLib Wiki Export

ScholarLib writes a generated, read-only Obsidian mirror to `_wiki_export_obsidian/`.

## Open The Vault

1. Sync your ScholarLib storage folder locally through Box or Dropbox.
2. In Obsidian, choose **Open folder as vault**.
3. Select the `_wiki_export_obsidian/` folder.

## Read-Only Policy

Do not edit files in `_wiki_export_obsidian/`. The canonical wiki is `_wiki/`, and ScholarLib regenerates the export. Any edits in the export can be overwritten.

## Recommended Plugins

- Dataview
- Graph Analysis

## Refreshing

If Obsidian shows stale pages or broken links, regenerate the export from ScholarLib settings.

## Accidental Edits

If you accidentally edit exported files, copy anything important elsewhere, then regenerate the export. Do not treat the export as canonical.
