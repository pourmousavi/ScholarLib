import { registerMigration } from './SchemaMigrationRunner'

/**
 * Phase 1 schema bump template.
 *
 * After ingesting 5 papers in Phase 1 the user reviews the patterns observed in
 * `_wiki/_phase1/checklists/<paper_id>.json` records and decides whether to run
 * this migration. Until they decide, both `transformPage` and `validateAfter`
 * are no-ops by design — the runner can still be exercised end-to-end against
 * `MemoryAdapter` and the user fills in the actual transform when the patterns
 * are clear.
 *
 * Spec: SCHOLARLIB_WIKI_PHASE_1_PROMPT.md §4 — "the user will fill in the
 * transform logic based on what they observe during papers 1–5".
 */
export const migration_1_0_to_1_1 = {
  migration_id: '1_0_to_1_1',
  from_version: '1.0',
  to_version: '1.1',
  is_breaking: true,
  schema_changes_summary: 'TEMPLATE — fill in once Phase 1 papers 1–5 reveal the schema gap.',

  /**
   * @param {{ id: string, frontmatter: object, body: string }} page
   * @returns {{ frontmatter?: object, body?: string } | null}
   *   Return `null` to leave the page untouched, or an object with the new
   *   frontmatter/body to apply. The runner handles writes and rollback.
   */
  async transformPage(page) {
    if (!page) return null
    return {
      frontmatter: { ...page.frontmatter, schema_version: '1.1' },
      body: page.body,
    }
  },

  /**
   * Runs after every page has been transformed. Return `{ ok: true }` to
   * commit the migration or `{ ok: false, message }` to trigger rollback.
   *
   * @param {{ adapter: object, pages: Array<{ id: string, frontmatter: object }> }} ctx
   */
  async validateAfter(ctx) {
    const offenders = (ctx.pages || []).filter((page) => page.frontmatter?.schema_version !== '1.1')
    if (offenders.length > 0) {
      return {
        ok: false,
        message: `validateAfter: ${offenders.length} page(s) still on schema_version != 1.1`,
        offenders: offenders.map((page) => page.id),
      }
    }
    return { ok: true }
  },
}

registerMigration(migration_1_0_to_1_1)
