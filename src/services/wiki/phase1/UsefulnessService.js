import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

export const USEFULNESS_MILESTONES = [3, 5, 7, 10]

function safeTimestamp(input) {
  const iso = input ? new Date(input).toISOString() : new Date().toISOString()
  return iso.replace(/[:.]/g, '-')
}

export function clampRating(rating) {
  const n = Number(rating)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.min(5, Math.round(n)))
}

export function shouldPromptForCheckIn(paperCount, existingRatings) {
  if (!USEFULNESS_MILESTONES.includes(paperCount)) return false
  return !existingRatings.some((entry) => entry.paper_index === paperCount)
}

export function averageRating(ratings) {
  const values = ratings.map((entry) => Number(entry.rating)).filter((value) => Number.isFinite(value))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export class UsefulnessService {
  constructor({ adapter } = {}) {
    if (!adapter) throw new Error('UsefulnessService requires a storage adapter')
    this.adapter = adapter
  }

  async listRatings() {
    let entries
    try {
      entries = await this.adapter.listFolder(WikiPaths.phase1UsefulnessRoot)
    } catch {
      return []
    }
    const records = []
    for (const entry of entries.filter((row) => row.type === 'file' && row.name.endsWith('.json'))) {
      const record = await readJSONOrNull(this.adapter, `${WikiPaths.phase1UsefulnessRoot}/${entry.name}`)
      if (record) records.push(record)
    }
    return records.sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
  }

  async recordRating({ rating, paperIndex, comment = '', recordedAt } = {}) {
    const clamped = clampRating(rating)
    if (clamped == null) throw new Error('rating must be a number between 1 and 5')
    const timestamp = recordedAt || new Date().toISOString()
    const record = {
      recorded_at: timestamp,
      paper_index: paperIndex ?? null,
      rating: clamped,
      comment: String(comment || ''),
    }
    await this.adapter.createFolder(WikiPaths.phase1UsefulnessRoot)
    await writeJSONWithRevision(this.adapter, WikiPaths.phase1Usefulness(safeTimestamp(timestamp)), record)
    return record
  }

  async average() {
    const ratings = await this.listRatings()
    return averageRating(ratings)
  }
}
