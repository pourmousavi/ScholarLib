export class RiskTierer {
  tierForChange(change, currentPage = null, extractionMetadata = {}) {
    const reason = this.reasonForChange(change, currentPage, extractionMetadata)
    return reason.tier
  }

  reasonForChange(change, currentPage = null, extractionMetadata = {}) {
    const high = (reason) => ({ tier: 'high', reason })
    const medium = (reason) => ({ tier: 'medium', reason })
    const low = (reason) => ({ tier: 'low', reason })
    const claims = [...(change.claims_added || []), ...(change.claims_modified || [])]

    if (change.is_deletion === true) return high('Deletion of canonical content')
    if (currentPage?.frontmatter?.human_edited === true) return high('Touches human-edited page')
    if (currentPage?.frontmatter?.type === 'position_draft') return high('Touches position draft')
    if (change.target_path?.startsWith('_private/') || change.target_path?.startsWith('_wiki/_private/')) return high('Touches private namespace')
    if (claims.some((claim) => claim.confidence === 'low')) return high('Adds or modifies low-confidence claim')
    if (claims.some((claim) => ['weakly_supported', 'unsupported'].includes(claim.verifier_status))) return high('Verifier marked a claim weakly supported or unsupported')
    if (change.contradiction_signal != null) return high('Contains contradiction signal')
    if ((change.parent_page_change_count || 0) > 3) return high('Proposal touches more than 3 pages')
    if ((extractionMetadata.extraction_confidence ?? 1) < 0.85) return high('PDF extraction confidence below 0.85')
    if ((extractionMetadata.ocr_warnings || []).length > 0) return high('PDF extraction produced OCR warnings')

    const targetType = change.page_type || change.draft_frontmatter?.type || currentPage?.frontmatter?.type
    if (change.operation === 'modify' && ['concept', 'method', 'dataset', 'person'].includes(targetType)) return medium('Modifies existing canonical knowledge page')
    if (change.is_creation === true && ['concept', 'method', 'dataset'].includes(targetType)) return medium('Creates canonical knowledge page')
    if ((change.claims_added || []).some((claim) => claim.confidence === 'medium')) return medium('Adds medium-confidence claim')

    if (change.is_creation === true && targetType === 'paper') return low('Creates a paper page from extracted metadata')
    if (change.candidate_only === true) return low('Adds candidate records only')
    return low('No deterministic escalator matched')
  }

  tierForProposal(changes) {
    if (changes.some((change) => change.risk_tier === 'high')) return 'high'
    if (changes.some((change) => change.risk_tier === 'medium')) return 'medium'
    return 'low'
  }
}
