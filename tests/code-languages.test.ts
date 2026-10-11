import { describe, expect, it } from 'vitest'
import { CODE_BLOCK_LANGUAGES, codeFenceSnippet, normalizeCodeBlockLanguage } from '../src/lib/codeLanguages'

describe('code block language preferences', () => {
  it('keeps supported defaults and safely falls back to plain text', () => {
    expect(normalizeCodeBlockLanguage('typescript')).toBe('text')
    expect(normalizeCodeBlockLanguage('ts')).toBe('ts')
    expect(normalizeCodeBlockLanguage('mermaid')).toBe('mermaid')
    expect(normalizeCodeBlockLanguage(undefined)).toBe('text')
    expect(normalizeCodeBlockLanguage('toString')).toBe('text')
  })

  it('offers a stable plain-text default alongside common code and diagram languages', () => {
    expect(CODE_BLOCK_LANGUAGES.text).toBe('Plain Text')
    expect(CODE_BLOCK_LANGUAGES.js).toBe('JavaScript')
    expect(CODE_BLOCK_LANGUAGES.python).toBe('Python')
    expect(CODE_BLOCK_LANGUAGES.mermaid).toBe('Mermaid')
  })

  it('uses the normalized preference for TypeOpen-owned code-fence snippets', () => {
    expect(codeFenceSnippet('python')).toBe('```python\ncode\n```')
    expect(codeFenceSnippet('unknown')).toBe('```text\ncode\n```')
  })
})
