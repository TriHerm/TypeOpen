import { describe, expect, it } from 'vitest'
import { normalizeOutlineMaxLevel, normalizeOutlineMode } from '../src/lib/outlinePreferences'

describe('outline preferences', () => {
  it('accepts supported outline modes and falls back safely', () => {
    expect(normalizeOutlineMode('hierarchical')).toBe('hierarchical')
    expect(normalizeOutlineMode('flat')).toBe('flat')
    expect(normalizeOutlineMode('nested')).toBe('hierarchical')
    expect(normalizeOutlineMode(null)).toBe('hierarchical')
  })

  it('accepts integer heading depths from 1 through 6 only', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) expect(normalizeOutlineMaxLevel(level)).toBe(level)
    for (const invalid of [0, 7, 2.5, '3', null, undefined]) expect(normalizeOutlineMaxLevel(invalid)).toBe(6)
  })
})
