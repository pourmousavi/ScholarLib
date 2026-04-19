import { CrossRefService } from './CrossRefService.js'
import { OpenAlexService } from './OpenAlexService.js'

export async function enrichFromDOI(doi) {
  const crossref = await CrossRefService.lookup(doi)
  let openalex = null
  try {
    openalex = await OpenAlexService.lookupByDOI(doi)
  } catch { /* optional, don't fail if unavailable */ }

  if (!crossref && !openalex) {
    return null
  }

  return {
    ...(crossref?.volume && { volume: crossref.volume }),
    ...(crossref?.issue && { issue: crossref.issue }),
    ...(crossref?.pages && { pages: crossref.pages }),
    ...(crossref?.authors?.length && { authors: crossref.authors }),
    ...(crossref?.type && { type: crossref.type }),
    ...(crossref?.abstract && { abstract: crossref.abstract }),
    ...(crossref?.journal && { journal: crossref.journal }),
    ...(crossref?.keywords?.length && { keywords: crossref.keywords }),
    ...(openalex?.citation_count != null && { citation_count: openalex.citation_count }),
    ...(openalex?.open_access_url && { open_access_url: openalex.open_access_url }),
    extraction_source: 'litorbit+crossref',
    extraction_date: new Date().toISOString(),
  }
}
