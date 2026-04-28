import { StorageError, STORAGE_ERRORS } from '../storage/StorageAdapter'
import { WikiPaths } from './WikiPaths'

export const DEFAULT_WIKI_SCHEMA = `# ScholarLib Wiki Schema

schema_version: "1.0"

## page_types

paper, concept, method, dataset, person, position_draft

## paper

Required frontmatter: id, handle, type, title, aliases, schema_version, created, last_updated.

## extraction_prompt

Return strict JSON with draft_frontmatter, draft_body, claims, methods_used, datasets_used,
concepts_touched, open_question_candidates, contradiction_signals, extraction_metadata.
Claims must include evidence locators with pdf_page, char_start, char_end, page_text_hash,
span_text_hash, and optional quote_snippet.
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
