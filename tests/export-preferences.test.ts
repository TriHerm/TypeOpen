import { describe, expect, it } from 'vitest'
import { normalizeExportAppearance, resolveExportTheme } from '../src/lib/exportPreferences'

describe('export appearance preferences', () => {
  it('normalizes persisted values to the allowlisted modes', () => {
    expect(normalizeExportAppearance('editor')).toBe('editor')
    expect(normalizeExportAppearance('light')).toBe('light')
    expect(normalizeExportAppearance('dark')).toBe('dark')
    expect(normalizeExportAppearance('custom')).toBe('editor')
    expect(normalizeExportAppearance(null)).toBe('editor')
  })

  it('allows explicit export light/dark to override the editor appearance', () => {
    expect(resolveExportTheme('light', 'dark', true)).toBe('light')
    expect(resolveExportTheme('dark', 'light', false)).toBe('dark')
  })

  it('matches explicit editor light/dark appearance', () => {
    expect(resolveExportTheme('editor', 'light', true)).toBe('light')
    expect(resolveExportTheme('editor', 'dark', false)).toBe('dark')
  })

  it('resolves system editor appearance at export time', () => {
    expect(resolveExportTheme('editor', 'system', false)).toBe('light')
    expect(resolveExportTheme('editor', 'system', true)).toBe('dark')
  })
})
