import { describe, expect, it } from 'vitest'
import { buildRecoverySnapshot, parseRecoverySnapshot } from '../src/lib/recovery'

describe('recovery snapshots', () => {
  it('persists only dirty documents and never promotes a source path into authority metadata', () => {
    const snapshot = buildRecoverySnapshot([
      { id: 'clean', markdown: '# Saved', dirty: false, sourcePath: '/tmp/saved.md', suggestedName: 'saved.md' },
      { id: 'dirty', markdown: '# Unsaved', dirty: true, sourcePath: '/tmp/open.md', suggestedName: 'open.md' }
    ], 'dirty')
    expect(snapshot.documents).toEqual([{ id: 'dirty', markdown: '# Unsaved', sourcePath: '/tmp/open.md', suggestedName: 'open.md' }])
    expect(snapshot.activeDocumentId).toBe('dirty')
  })

  it('rejects malformed or oversized document lists defensively', () => {
    expect(parseRecoverySnapshot({ version: 1, documents: [{ id: '', markdown: 'x' }] })).toBeNull()
    expect(parseRecoverySnapshot({ version: 2, documents: [] })).toBeNull()
    expect(parseRecoverySnapshot({ version: 1, documents: Array.from({ length: 21 }, (_, index) => ({ id: String(index), markdown: '' })) })).toBeNull()
  })

  it('builds an empty snapshot once every document is clean', () => {
    expect(buildRecoverySnapshot([
      { id: 'one', markdown: '# One', dirty: false, sourcePath: '/tmp/one.md' },
      { id: 'two', markdown: '# Two', dirty: false, sourcePath: '/tmp/two.md' }
    ], 'two')).toEqual({ version: 1, documents: [] })
  })
})
