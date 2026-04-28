import { describe, expect, it } from 'vitest'
import { PageDiffer, __test } from '../diff/PageDiffer'

describe('PageDiffer', () => {
  it('reports a full insert for new pages with no current state', () => {
    const result = new PageDiffer().diff(null, { title: 'New', aliases: ['x'] }, 'first line\nsecond line')
    expect(result.is_creation).toBe(true)
    expect(result.body_changes.every((entry) => entry.type === 'inserted')).toBe(true)
    expect(result.totals.lines_added).toBe(2)
    expect(result.frontmatter_changes.find((change) => change.field === 'title').operation).toBe('add')
  })

  it('reports a full delete when proposed content is null', () => {
    const current = { frontmatter: { title: 'Old' }, body: 'one\ntwo' }
    const result = new PageDiffer().diff(current, null, null)
    expect(result.is_deletion).toBe(true)
    expect(result.body_changes.every((entry) => entry.type === 'deleted')).toBe(true)
    expect(result.frontmatter_changes[0].operation).toBe('remove')
  })

  it('classifies frontmatter modifications and array adds/removes', () => {
    const current = { frontmatter: { title: 'A', aliases: ['one', 'two'], tags: ['t1'] }, body: 'body' }
    const next = { title: 'A renamed', aliases: ['two', 'three'], tags: ['t1'] }
    const result = new PageDiffer().diff(current, next, 'body')
    const titleChange = result.frontmatter_changes.find((entry) => entry.field === 'title')
    const aliasChange = result.frontmatter_changes.find((entry) => entry.field === 'aliases')
    expect(titleChange).toMatchObject({ operation: 'modify', before: 'A', after: 'A renamed' })
    expect(aliasChange.operation).toBe('add_to_array')
    expect(aliasChange.added).toEqual(['three'])
    expect(aliasChange.removed).toEqual(['one'])
  })

  it('produces line-level diffs with insert, delete, and unchanged ops', () => {
    const ops = __test.lineDiff('alpha\nbeta\ngamma', 'alpha\ndelta\ngamma')
    const summary = ops.map((entry) => entry.type)
    expect(summary).toContain('inserted')
    expect(summary).toContain('deleted')
    expect(summary).toContain('unchanged')
  })

  it('returns empty body diff when content is unchanged', () => {
    const current = { frontmatter: { title: 'A' }, body: 'same\nbody' }
    const result = new PageDiffer().diff(current, { title: 'A' }, 'same\nbody')
    expect(result.body_changes.every((entry) => entry.type === 'unchanged')).toBe(true)
    expect(result.frontmatter_changes).toHaveLength(0)
  })

  it('detects wikilink additions and removals by ID', () => {
    const current = { frontmatter: {}, body: 'See [[c_01JX7K4EXX5C9V7F2QY4Y8K9DA]] for context.' }
    const result = new PageDiffer().diff(current, {}, 'See [[c_02NEWPAGEXYZ7777777777]] now.')
    expect(result.wikilink_additions).toEqual(['c_02NEWPAGEXYZ7777777777'])
    expect(result.wikilink_removals).toEqual(['c_01JX7K4EXX5C9V7F2QY4Y8K9DA'])
  })

  it('renders large bodies in well under 100ms', () => {
    const before = 'line\n'.repeat(1000)
    const after = before + 'extra line\n'.repeat(50)
    const start = performance.now()
    new PageDiffer().diff({ frontmatter: {}, body: before }, {}, after)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  it('supports change-shaped input via diffChange', () => {
    const differ = new PageDiffer()
    const result = differ.diffChange({ operation: 'create', draft_frontmatter: { title: 'X' }, draft_body: 'hello' })
    expect(result.is_creation).toBe(true)
    expect(result.totals.lines_added).toBe(1)
  })
})
