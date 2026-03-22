# ScholarLib — Library Schema

> Reference this document throughout all stages. Never change this schema without updating ALL stages that reference it.

---

## library.json — Full Schema

Stored at: `/ScholarLib/_system/library.json` in Box/Dropbox.

```json
{
  "version": "1.0",
  "schema_updated": "2026-03-23",
  "last_modified": "ISO8601 timestamp",
  "last_modified_by": "device-id or email",
  "folders": [FolderNode],
  "documents": {
    "[doc-id]": DocumentRecord
  },
  "tag_registry": {
    "[tag-slug]": TagRecord
  },
  "smart_collections": [SmartCollection]
}
```

---

## FolderNode

```json
{
  "id": "f_[nanoid]",
  "name": "BESS",
  "slug": "bess",
  "parent_id": null,
  "children": ["f_[nanoid2]", "f_[nanoid3]"],
  "created_at": "ISO8601",
  "shared_with": [
    {
      "email": "student@adelaide.edu.au",
      "permission": "viewer",
      "share_id": "sh_[nanoid]",
      "shared_at": "ISO8601"
    }
  ],
  "color": null,
  "icon": null,
  "sort_order": 0
}
```

### Rules
- `id` always prefixed `f_`
- `parent_id` is null for root-level folders
- `children` contains IDs of immediate child folders (not documents)
- `slug` is URL-safe lowercase version of name (used for Box folder path)
- Max depth: 5 levels (enforced in UI)

---

## DocumentRecord

```json
{
  "id": "d_[nanoid]",
  "folder_id": "f_[nanoid]",
  "box_path": "/ScholarLib/PDFs/bess/degradation/zhang-2024-calendar-aging.pdf",
  "box_file_id": "box-native-file-id",
  "filename": "zhang-2024-calendar-aging.pdf",
  "added_at": "ISO8601",
  "added_by": "ali@adelaide.edu.au",

  "metadata": {
    "title": "Calendar Aging Model for Li-Ion Batteries in Hot Climate Conditions",
    "authors": [
      { "last": "Zhang", "first": "Y.", "orcid": null },
      { "last": "Chen",  "first": "L.", "orcid": null },
      { "last": "Pourmousavi", "first": "S.A.", "orcid": "0000-0001-xxxx" }
    ],
    "year": 2024,
    "journal": "Applied Energy",
    "volume": "357",
    "issue": null,
    "pages": "122-138",
    "doi": "10.1016/j.apenergy.2024.01.042",
    "abstract": "This paper presents...",
    "keywords": ["battery degradation", "calendar aging", "BESS"],
    "url": "https://doi.org/10.1016/j.apenergy.2024.01.042",
    "language": "en",
    "type": "journal-article",
    "extraction_source": "crossref",
    "extraction_confidence": {
      "title": 99,
      "authors": 97,
      "journal": 99,
      "doi": 100,
      "year": 99,
      "abstract": 85
    },
    "extraction_date": "ISO8601"
  },

  "user_data": {
    "read": false,
    "read_at": null,
    "starred": false,
    "tags": ["degradation", "thermal", "calendar-aging"],  // Tag slugs referencing tag_registry
    "rating": null,
    "custom_fields": {}
  },

  "index_status": {
    "status": "indexed",
    "indexed_at": "ISO8601",
    "indexed_on_device": "MacBook-Ali",
    "model_used": "nomic-embed-text",
    "chunk_count": 47,
    "embedding_version": "v1"
  }
}
```

### index_status.status values
- `"none"` — not yet indexed (just uploaded)
- `"pending"` — queued for indexing
- `"processing"` — currently being indexed
- `"indexed"` — ready for AI search
- `"failed"` — indexing failed (error stored in `index_status.error`)
- `"stale"` — indexed with an older model version, re-indexing recommended

---

## TagRecord

Tags are stored in a global registry with metadata. Documents reference tags by slug only.

```json
{
  "battery-thermal-management": {
    "displayName": "Battery Thermal Management",
    "color": "#4A90D9",
    "category": null,
    "description": "",
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-15T10:30:00Z"
  },
  "to-cite": {
    "displayName": "To Cite",
    "color": "#E85D75",
    "category": "status",
    "description": "Papers to cite in current manuscript",
    "created_at": "2026-02-20T14:00:00Z",
    "updated_at": "2026-02-20T14:00:00Z"
  },
  "literature-review": {
    "displayName": "Literature Review",
    "color": "#50C878",
    "category": "workflow",
    "description": "",
    "created_at": "2026-03-01T09:00:00Z",
    "updated_at": "2026-03-01T09:00:00Z"
  }
}
```

### Tag Fields

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Original user input for display (e.g., "Battery Thermal Management") |
| `color` | string | Hex color code for visual distinction (default: system assigns from palette) |
| `category` | string \| null | Optional grouping (e.g., "topics", "status", "workflow", "projects") |
| `description` | string | Optional description of what this tag represents |
| `created_at` | ISO8601 | When the tag was first created |
| `updated_at` | ISO8601 | When the tag metadata was last modified |

### Tag Slug Rules
- The key (slug) is derived from `displayName`
- Lowercase only
- Spaces replaced with hyphens
- Special characters removed
- Must be unique across registry
- Example: "Battery Thermal Management" → `battery-thermal-management`

### Tag Deletion Behavior
When a tag is deleted from the registry:
1. Remove the tag entry from `tag_registry`
2. Remove the tag slug from ALL `documents[*].user_data.tags` arrays
3. Remove the tag slug from ALL `notes[*].tags` arrays
4. This is an atomic operation — all references are cleaned up

### Default Color Palette
When a tag is created without a color, assign from this rotating palette:
```javascript
const TAG_COLORS = [
  '#4A90D9', // Blue
  '#E85D75', // Rose
  '#50C878', // Emerald
  '#9B59B6', // Purple
  '#F39C12', // Amber
  '#1ABC9C', // Teal
  '#E67E22', // Orange
  '#3498DB', // Sky
]
```

---

## SmartCollection

Smart collections are saved tag-based filters that auto-update as documents are tagged.

```json
{
  "id": "sc_a1b2c3d4",
  "name": "Chapter 3 Sources",
  "icon": "bookmark",
  "filter": {
    "tags": ["literature-review", "chapter-3"],
    "tagMode": "AND",
    "starred": null,
    "read": true
  },
  "created_at": "2026-03-15T14:00:00Z",
  "updated_at": "2026-03-15T14:00:00Z"
}
```

### SmartCollection Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID prefixed with `sc_` |
| `name` | string | Display name for the collection |
| `icon` | string | Icon identifier (bookmark, folder, star, tag, etc.) |
| `filter.tags` | string[] | Array of tag slugs to match |
| `filter.tagMode` | "AND" \| "OR" | How to combine multiple tags |
| `filter.starred` | boolean \| null | Filter by starred status (null = ignore) |
| `filter.read` | boolean \| null | Filter by read status (null = ignore) |
| `created_at` | ISO8601 | When the collection was created |
| `updated_at` | ISO8601 | When the collection was last modified |

### Evaluation Logic
```javascript
function matchesCollection(doc, collection) {
  const { tags, tagMode, starred, read } = collection.filter
  const docTags = doc.user_data?.tags || []

  // Tag matching
  const tagMatch = tagMode === 'AND'
    ? tags.every(t => docTags.includes(t))
    : tags.some(t => docTags.includes(t))

  // Additional filters
  const starredMatch = starred === null || doc.user_data?.starred === starred
  const readMatch = read === null || doc.user_data?.read === read

  return tagMatch && starredMatch && readMatch
}
```

---

## notes.json

Stored at: `/ScholarLib/_system/notes.json`

```json
{
  "version": "1.0",
  "notes": {
    "[doc-id]": {
      "content": "Markdown string...",
      "tags": ["degradation", "hot-climate"],
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "ai_summary": "One paragraph summary generated by AI",
      "ai_summary_generated_at": "ISO8601"
    }
  }
}
```

**Note:** The `tags` array in notes contains tag slugs that reference the global `tag_registry` in `library.json`. When a tag is deleted from the registry, it is also removed from all note tag arrays.

---

## chat_history.json

Stored at: `/ScholarLib/_system/chat_history.json`

```json
{
  "version": "1.0",
  "conversations": [
    {
      "id": "c_[nanoid]",
      "title": "Degradation rate comparison across papers",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "scope": {
        "type": "folder",
        "folder_id": "f_[nanoid]",
        "folder_name": "Degradation",
        "doc_count": 18
      },
      "model": "llama3.2",
      "provider": "ollama",
      "messages": [
        {
          "id": "m_[nanoid]",
          "role": "assistant",
          "content": "I have indexed 17 documents...",
          "timestamp": "ISO8601",
          "citations": [
            { "doc_id": "d_[nanoid]", "chunk_index": 3, "relevance": 0.92 }
          ]
        },
        {
          "id": "m_[nanoid]",
          "role": "user",
          "content": "What are the main findings on degradation at high temperature?",
          "timestamp": "ISO8601",
          "citations": null
        }
      ],
      "token_usage": {
        "prompt_tokens": 4821,
        "completion_tokens": 312,
        "cost_usd": null
      }
    }
  ]
}
```

---

## settings.json

Stored at: `/ScholarLib/_system/settings.json`

```json
{
  "version": "1.0",
  "devices": {
    "[device-fingerprint]": {
      "device_name": "MacBook-Ali",
      "last_seen": "ISO8601",
      "ai_provider": "ollama",
      "ai_model": "llama3.2",
      "embedding_model": "nomic-embed-text"
    }
  },
  "global": {
    "metadata_extraction_mode": "review",
    "default_folder_id": null,
    "chat_export_include_citations": true,
    "chat_export_include_model": true,
    "default_export_format": "markdown",
    "sidebar_collapsed": false
  }
}
```

Note: API keys are stored ONLY in `localStorage` on each device. They are never written to settings.json or any Box file.

---

## index_meta.json

Stored at: `/ScholarLib/_system/index/index_meta.json`

```json
{
  "version": "v1",
  "embedding_model": "nomic-embed-text",
  "embedding_dimensions": 768,
  "total_chunks": 1247,
  "total_docs_indexed": 89,
  "last_updated": "ISO8601",
  "docs": {
    "[doc-id]": {
      "chunk_count": 47,
      "chunk_offset": 0,
      "indexed_at": "ISO8601"
    }
  }
}
```

The actual embeddings are stored as a flat binary file `embeddings_v1.bin`:
- Format: contiguous Float32Array, 768 floats per chunk
- Chunk at position `i` corresponds to chunk metadata at `index_meta.docs[doc_id].chunk_offset + i`
- Separate `chunks_meta.json` stores `{ doc_id, chunk_index, page_approx, text_preview }` for each chunk
