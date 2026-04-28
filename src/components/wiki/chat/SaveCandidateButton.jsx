import { useState } from 'react'
import { CandidateStore } from '../../../services/wiki/chat/CandidateStore'

function wikiEnabled() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('sv_wiki_enabled') === 'true'
}

export default function SaveCandidateButton({ adapter, question, answer, provenance }) {
  const [status, setStatus] = useState('idle')
  if (!wikiEnabled() || !adapter || !answer) return null

  const save = async () => {
    if (!window.confirm('Save this answer as a wiki candidate?')) return
    setStatus('saving')
    try {
      await new CandidateStore(adapter).saveCandidate({
        question,
        answer,
        provenance,
        suggestedConceptPages: provenance?.wiki?.page_ids || provenance?.retrieval?.wiki?.pages?.map(page => page.page_id).filter(Boolean) || [],
      })
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <button type="button" className="saveCandidateButton" onClick={save} disabled={status === 'saving' || status === 'saved'}>
      {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving...' : 'Save as candidate'}
    </button>
  )
}
