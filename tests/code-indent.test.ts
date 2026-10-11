import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { applyFocusedCodeMirrorIndent } from '../src/editor/MarkdownEditor'

const views: EditorView[] = []

function createCodeMirror(surface: HTMLElement, doc: string, anchor: number, head = anchor, readOnly = false) {
  const host = document.createElement('div')
  surface.append(host)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(anchor, head),
      extensions: readOnly ? [EditorState.readOnly.of(true)] : []
    })
  })
  views.push(view)
  view.contentDOM.focus()
  return view
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.innerHTML = ''
})

describe('native indent/outdent bridge', () => {
  it('indents and outdents the focused CodeMirror selection', () => {
    const surface = document.createElement('div')
    document.body.append(surface)
    const view = createCodeMirror(surface, 'first\nsecond', 0, 12)

    expect(applyFocusedCodeMirrorIndent(surface, 'indent')).toBe(true)
    expect(view.state.doc.toString()).toBe('  first\n  second')
    expect(applyFocusedCodeMirrorIndent(surface, 'outdent')).toBe(true)
    expect(view.state.doc.toString()).toBe('first\nsecond')
  })

  it('indents and outdents the current CodeMirror block with a caret', () => {
    const surface = document.createElement('div')
    document.body.append(surface)
    const view = createCodeMirror(surface, 'first\nsecond', 8)

    expect(applyFocusedCodeMirrorIndent(surface, 'indent')).toBe(true)
    expect(view.state.doc.toString()).toBe('first\n  second')
    expect(applyFocusedCodeMirrorIndent(surface, 'outdent')).toBe(true)
    expect(view.state.doc.toString()).toBe('first\nsecond')
  })

  it('does not target a CodeMirror editor outside the TypeOpen surface', () => {
    const surface = document.createElement('div')
    const otherSurface = document.createElement('div')
    document.body.append(surface, otherSurface)
    const view = createCodeMirror(otherSurface, 'outside', 0)

    expect(applyFocusedCodeMirrorIndent(surface, 'indent')).toBe(false)
    expect(view.state.doc.toString()).toBe('outside')
  })

  it('respects a read-only CodeMirror state', () => {
    const surface = document.createElement('div')
    document.body.append(surface)
    const view = createCodeMirror(surface, 'read only', 0, 9, true)

    expect(applyFocusedCodeMirrorIndent(surface, 'indent')).toBe(false)
    expect(view.state.doc.toString()).toBe('read only')
  })
})
