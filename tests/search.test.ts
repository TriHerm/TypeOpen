import { describe, expect, it } from 'vitest'
import { replaceAllSearch, searchText } from '../src/lib/search'

describe('advanced search helpers', () => {
  it('keeps literal metacharacters literal by default', () => {
    expect(searchText('a.b aXb a.b', 'a.b').matches.map((match) => match.index)).toEqual([0, 8])
  })

  it('supports whole-word and case controls independently', () => {
    expect(searchText('cat scatter Cat', 'cat', { wholeWord: true }).matches.map((match) => match.text)).toEqual(['cat', 'Cat'])
    expect(searchText('cat scatter Cat', 'cat', { wholeWord: true, matchCase: true }).matches.map((match) => match.text)).toEqual(['cat'])
    expect(searchText('café cafés café', 'café', { wholeWord: true }).matches.map((match) => match.index)).toEqual([0, 11])
  })

  it('supports variable-length regular expressions and rejects invalid patterns', () => {
    const result = searchText('id-1 id-22 id-x', String.raw`id-\d+`, { regex: true })
    expect(result.error).toBeNull()
    expect(result.matches.map((match) => [match.index, match.length])).toEqual([[0, 4], [5, 5]])
    expect(searchText('text', '[', { regex: true }).error).toBeTruthy()
  })

  it('replaces by the actual match length rather than the query length', () => {
    expect(replaceAllSearch('id-1 id-22 id-x', String.raw`id-\d+`, 'item', { regex: true })).toEqual({
      value: 'item item id-x',
      count: 2,
      error: null
    })
  })
})
