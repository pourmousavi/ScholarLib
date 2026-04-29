import { describe, expect, it } from 'vitest'
import { authorDisplay } from '../authorDisplay'

describe('authorDisplay', () => {
  it('renders the existing first/last shape', () => {
    expect(authorDisplay({ first: 'Ali', last: 'Pourmousavi' })).toBe('Ali Pourmousavi')
  })

  it('renders the CSL given/family shape used by CrossRef imports', () => {
    expect(authorDisplay({ given: 'Andrej', family: 'Karpathy' })).toBe('Andrej Karpathy')
  })

  it('renders camelCase firstName/lastName', () => {
    expect(authorDisplay({ firstName: 'Geoffrey', lastName: 'Hinton' })).toBe('Geoffrey Hinton')
  })

  it('renders bare-string author entries', () => {
    expect(authorDisplay('Yoshua Bengio')).toBe('Yoshua Bengio')
  })

  it('falls back to a single name field when first/last are missing', () => {
    expect(authorDisplay({ name: 'Yann LeCun' })).toBe('Yann LeCun')
  })

  it('prefers full_name when both full_name and first/last are present', () => {
    expect(authorDisplay({ full_name: 'Demis Hassabis', first: 'D', last: 'H' })).toBe('Demis Hassabis')
  })

  it('handles surname alias', () => {
    expect(authorDisplay({ given: 'Ada', surname: 'Lovelace' })).toBe('Ada Lovelace')
  })

  it('returns a JSON dump only when nothing else is recognisable', () => {
    expect(authorDisplay({ orcid: '0000-0000-0000-0000', affiliation: 'X' })).toContain('orcid')
  })

  it('returns empty string for null / undefined', () => {
    expect(authorDisplay(null)).toBe('')
    expect(authorDisplay(undefined)).toBe('')
  })

  it('trims whitespace-only fields', () => {
    expect(authorDisplay({ first: '   ', last: 'Smith' })).toBe('Smith')
  })
})
