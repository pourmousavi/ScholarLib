import { WikiPaths } from '../WikiPaths'
import { readJSONOrNull, writeJSONWithRevision } from '../WikiStorage'

const PATHS = ['current_rag', 'improved_rag', 'wiki_assisted']

function shuffle(values, seedText = '') {
  const rows = [...values]
  let seed = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1
  for (let i = rows.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280
    const j = seed % (i + 1)
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  return rows
}

export class BenchmarkSession {
  constructor({ adapter, orchestrator }) {
    this.adapter = adapter
    this.orchestrator = orchestrator
    this.results = []
  }

  async loadQuestions() {
    const file = await readJSONOrNull(this.adapter, WikiPaths.phase5BenchmarkQuestions)
    return file?.questions || []
  }

  async runQuestion(question, commonOptions = {}) {
    const responses = []
    for (const path of PATHS) {
      const started = performance.now?.() || Date.now()
      const request = await this.orchestrator.chat(question.query, [], question.scope || { type: 'library', description: 'entire library' }, {
        ...commonOptions,
        routeMode: path,
        manual_route: path === 'current_rag' ? 'rag_only' : path === 'improved_rag' ? 'improved_rag' : 'both',
      })
      let answer = ''
      for await (const chunk of request.stream) answer += chunk
      responses.push({
        path,
        answer,
        provenance: request.provenance,
        latency_ms: Math.round((performance.now?.() || Date.now()) - started),
        cost_usd: request.provenance?.cost_estimate_usd || 0,
      })
    }
    const row = {
      question_id: question.id,
      query: question.query,
      intent: question.intent || 'mixed',
      responses: shuffle(responses, question.id || question.query).map((response, index) => ({
        ...response,
        blinded_id: `response_${index + 1}`,
        revealed: false,
      })),
      scored: false,
    }
    this.results.push(row)
    return row
  }

  score(questionId, blindedId, scores, comments = '') {
    const question = this.results.find(row => row.question_id === questionId)
    if (!question) throw new Error(`Benchmark question not found: ${questionId}`)
    const response = question.responses.find(row => row.blinded_id === blindedId)
    if (!response) throw new Error(`Benchmark response not found: ${blindedId}`)
    response.scores = scores
    response.comments = comments
    response.revealed = true
    question.scored = question.responses.every(row => row.scores)
    return response
  }

  aggregate() {
    const rows = {}
    for (const question of this.results) {
      for (const response of question.responses) {
        if (!response.scores) continue
        const key = `${question.intent}:${response.path}`
        rows[key] ||= { intent: question.intent, path: response.path, count: 0, usefulness: 0, citation_correctness: 0, writing_utility: 0, cost_usd: 0, latency_ms: 0 }
        rows[key].count += 1
        rows[key].usefulness += response.scores.usefulness || 0
        rows[key].citation_correctness += response.scores.citation_correctness || 0
        rows[key].writing_utility += response.scores.writing_utility || 0
        rows[key].cost_usd += response.cost_usd || 0
        rows[key].latency_ms += response.latency_ms || 0
      }
    }
    return Object.values(rows).map(row => ({
      ...row,
      usefulness: row.usefulness / row.count,
      citation_correctness: row.citation_correctness / row.count,
      writing_utility: row.writing_utility / row.count,
      latency_ms: row.latency_ms / row.count,
    }))
  }

  decideDefaults({ overrides = {} } = {}) {
    const aggregate = this.aggregate()
    const defaults = {}
    for (const intent of ['extractive', 'synthetic', 'mixed']) {
      const rows = aggregate.filter(row => row.intent === intent)
      const winner = [...rows].sort((a, b) => b.usefulness - a.usefulness || a.cost_usd - b.cost_usd)[0]
      defaults[`${intent}_default`] = overrides[intent] || winner?.path || 'current_rag'
    }
    return defaults
  }

  async writeReport({ overrides = {} } = {}) {
    const aggregate = this.aggregate()
    const defaults = {
      ...this.decideDefaults({ overrides }),
      decided_at: new Date().toISOString(),
      benchmark_report: WikiPaths.phase5BenchmarkReport,
    }
    await writeJSONWithRevision(this.adapter, WikiPaths.chatRoutingDefaults, defaults)
    const report = this.renderReport(aggregate, defaults)
    await this.adapter.writeTextIfRevision(WikiPaths.phase5BenchmarkReport, report, null).catch(async () => {
      const meta = await this.adapter.getMetadata(WikiPaths.phase5BenchmarkReport)
      return this.adapter.writeTextIfRevision(WikiPaths.phase5BenchmarkReport, report, meta.revision)
    })
    return { aggregate, defaults, report }
  }

  renderReport(aggregate, defaults) {
    const lines = ['# Phase 5 Benchmark Report', '', `Generated: ${new Date().toISOString()}`, '']
    lines.push('| Intent | Path | Usefulness | Citation | Writing | Cost | Latency ms |')
    lines.push('|---|---:|---:|---:|---:|---:|---:|')
    for (const row of aggregate) {
      lines.push(`| ${row.intent} | ${row.path} | ${row.usefulness.toFixed(2)} | ${row.citation_correctness.toFixed(2)} | ${row.writing_utility.toFixed(2)} | ${row.cost_usd.toFixed(4)} | ${row.latency_ms.toFixed(0)} |`)
    }
    lines.push('', '## Routing Defaults', '', '```json', JSON.stringify(defaults, null, 2), '```')
    return lines.join('\n')
  }
}

export { PATHS as BENCHMARK_PATHS }
