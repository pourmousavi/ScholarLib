import { registerMigration } from './SchemaMigrationRunner'

export const migration_1_1_to_1_2 = {
  migration_id: '1_1_to_1_2',
  from_version: '1.1',
  to_version: '1.2',
  is_breaking: false,
  schema_changes_summary: 'Add optional related_source_docs and archived/superseded frontmatter conventions.',

  async transformPage(page) {
    if (!page) return null
    return {
      frontmatter: { ...page.frontmatter, schema_version: '1.2' },
      body: page.body,
    }
  },

  async validateAfter(ctx) {
    const offenders = (ctx.pages || []).filter((page) => page.frontmatter?.schema_version !== '1.2')
    if (offenders.length > 0) {
      return {
        ok: false,
        message: `validateAfter: ${offenders.length} page(s) still on schema_version != 1.2`,
        offenders: offenders.map((page) => page.id),
      }
    }
    return { ok: true }
  },
}

registerMigration(migration_1_1_to_1_2)
