import { describe, expect, it } from 'vitest'
import { isExportFormat, rememberSuccessfulExport, successfulExportPath, type ExportFormat } from '../src/lib/exportHistory'

describe('previous export session history', () => {
  it('accepts only the export formats exposed by TypeOpen', () => {
    expect(isExportFormat('pdf')).toBe(true)
    expect(isExportFormat('mediawiki')).toBe(true)
    expect(isExportFormat('overwrite')).toBe(false)
    expect(isExportFormat(null)).toBe(false)
  })

  it('records direct exports only after the host returns a destination', () => {
    const history = new Map<string, ExportFormat>([['doc-1', 'pdf']])

    expect(rememberSuccessfulExport(history, 'doc-1', 'html', null)).toBeNull()
    expect(history.get('doc-1')).toBe('pdf')

    expect(rememberSuccessfulExport(history, 'doc-1', 'html', { filePath: '/tmp/note.html' })).toBe('/tmp/note.html')
    expect(history.get('doc-1')).toBe('html')
  })

  it('does not replace previous history on failed or cancelled Pandoc exports', () => {
    const history = new Map<string, ExportFormat>([['doc-1', 'docx']])

    expect(rememberSuccessfulExport(history, 'doc-1', 'epub', { ok: false, error: 'Pandoc unavailable' })).toBeNull()
    expect(history.get('doc-1')).toBe('docx')
    expect(rememberSuccessfulExport(history, 'doc-1', 'epub', null)).toBeNull()
    expect(history.get('doc-1')).toBe('docx')

    expect(rememberSuccessfulExport(history, 'doc-1', 'epub', { ok: true, filePath: '/tmp/note.epub' })).toBe('/tmp/note.epub')
    expect(history.get('doc-1')).toBe('epub')
  })

  it('keeps history isolated by document id', () => {
    const history = new Map<string, ExportFormat>()
    rememberSuccessfulExport(history, 'doc-a', 'pdf', { filePath: '/tmp/a.pdf' })
    rememberSuccessfulExport(history, 'doc-b', 'html', { filePath: '/tmp/b.html' })

    expect(history.get('doc-a')).toBe('pdf')
    expect(history.get('doc-b')).toBe('html')
    expect(successfulExportPath('docx', { ok: true })).toBeNull()
  })
})
