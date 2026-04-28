import { PageStore, slugify } from '../PageStore'
import { WikiPaths } from '../WikiPaths'

export class PositionDraftService {
  constructor(adapter) {
    this.adapter = adapter
  }

  async listDrafts() {
    try {
      return (await this.adapter.listFolder(WikiPaths.positionDraftsRoot)).filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
    } catch {
      return []
    }
  }

  async readDraft(handle) {
    const path = `${WikiPaths.positionDraftsRoot}/${slugify(handle)}.md`
    return this.adapter.readTextWithMetadata(path)
  }

  async writeDraft(handle, frontmatter, body, expectedRevision = null) {
    const id = frontmatter.id || `po_${handle}`
    return PageStore.writePage(this.adapter, {
      id,
      handle: slugify(handle),
      type: 'position_draft',
      title: frontmatter.title || handle,
      frontmatter: {
        ...frontmatter,
        id,
        handle: slugify(handle),
        type: 'position_draft',
        voice_status: 'draft_requires_human_edit',
      },
      body,
    }, expectedRevision)
  }
}
