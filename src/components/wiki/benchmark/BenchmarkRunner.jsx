import { useState } from 'react'
import { BenchmarkSession } from '../../../services/wiki/benchmark/BenchmarkSession'
import { chatOrchestrator } from '../../../services/ai/ChatOrchestrator'

export default function BenchmarkRunner({ adapter, questions = [] }) {
  const [rows, setRows] = useState([])
  const [scores, setScores] = useState({})
  const [status, setStatus] = useState('idle')

  const run = async () => {
    setStatus('running')
    const session = new BenchmarkSession({ adapter, orchestrator: chatOrchestrator })
    const source = questions.length > 0 ? questions : await session.loadQuestions()
    const nextRows = []
    for (const question of source) {
      nextRows.push(await session.runQuestion(question, { adapter, provider: 'ollama', model: 'llama3.2', wikiEnabled: true }))
    }
    setRows(nextRows)
    setStatus('ready_to_score')
  }

  const updateScore = (questionId, blindedId, field, value) => {
    setScores(prev => ({
      ...prev,
      [`${questionId}:${blindedId}`]: {
        ...(prev[`${questionId}:${blindedId}`] || {}),
        [field]: Number(value),
      },
    }))
  }

  return (
    <section>
      <button type="button" onClick={run} disabled={!adapter || status === 'running'}>
        {status === 'running' ? 'Running benchmark...' : 'Run Phase 5 benchmark'}
      </button>
      {rows.map(row => (
        <article key={row.question_id}>
          <h3>{row.query}</h3>
          {row.responses.map(response => (
            <div key={response.blinded_id}>
              <h4>{response.blinded_id}</h4>
              <p>{response.answer}</p>
              {['usefulness', 'citation_correctness', 'writing_utility'].map(field => (
                <label key={field}>
                  {field}
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={scores[`${row.question_id}:${response.blinded_id}`]?.[field] || ''}
                    onChange={(event) => updateScore(row.question_id, response.blinded_id, field, event.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </article>
      ))}
    </section>
  )
}
