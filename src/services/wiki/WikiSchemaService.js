import { StorageError, STORAGE_ERRORS } from '../storage/StorageAdapter'
import { WikiPaths } from './WikiPaths'

export const SCHEMA_VERSION = '1.2'

export const DEFAULT_WIKI_SCHEMA = `# ScholarLib Wiki Schema

schema_version: "1.2"

## page_types

paper, concept, method, dataset, person, position_draft

## paper

Required frontmatter: id, handle, type, title, aliases, schema_version, created, last_updated.

## extraction_prompt

Return strict JSON with draft_frontmatter, draft_body, claims, methods_used, datasets_used,
concepts_touched, open_question_candidates, contradiction_signals, extraction_metadata.
Claims must include evidence locators with pdf_page, char_start, char_end, page_text_hash,
span_text_hash, and optional quote_snippet.

## 6.10 related_source_docs

Grant pages may record additional ScholarLib source documents in frontmatter.

\`\`\`yaml
related_source_docs:
  - scholarlib_doc_id: d_01H...
    relation: outcome_notice
    title: "Reviewer report.pdf"
    added_at: YYYY-MM-DD
\`\`\`

Allowed relation values: application_pdf, outcome_notice, reviewer_feedback,
budget_attachment, support_letter, appendix, other.

## 6.11 archived and superseded pages

Canonical pages are not deleted by the app in Increment 1. Pages that should be
hidden from normal browsing/retrieval can be marked:

\`\`\`yaml
archived: true
archive_reason: duplicate
superseded_by: c_01H...
\`\`\`

Allowed archive_reason values: duplicate, mistake, superseded, other.
superseded_by is optional, but when present it must point at an existing page id.
`

export class WikiSchemaService {
  static async ensure(adapter) {
    try {
      await adapter.getMetadata(WikiPaths.schema)
    } catch (error) {
      if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      await adapter.writeTextIfRevision(WikiPaths.schema, DEFAULT_WIKI_SCHEMA, null)
    }
  }

  static async read(adapter) {
    await this.ensure(adapter)
    try {
      return (await adapter.readTextWithMetadata(WikiPaths.schema)).text
    } catch (error) {
      if (error.code !== STORAGE_ERRORS.NOT_FOUND) throw error
      return DEFAULT_WIKI_SCHEMA
    }
  }

  static missingSchemaError() {
    return new StorageError(STORAGE_ERRORS.NOT_FOUND, 'Wiki schema not found')
  }
}
