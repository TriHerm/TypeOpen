import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { markdownListContinuation } from '../src/editor/sourceTyping'

function editFor(text: string) {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(text.length),
    extensions: [markdown()]
  })
  return markdownListContinuation(state)
}

function applyEdit(text: string) {
  const state = EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(text.length),
    extensions: [markdown()]
  })
  const edit = markdownListContinuation(state)
  if (!edit) return null
  const transaction = state.update({ changes: edit.changes, selection: edit.selection })
  return { text: transaction.state.doc.toString(), cursor: transaction.state.selection.main.head }
}

describe('Source Mode list continuation', () => {
  it('continues bullet lists with the same marker', () => {
    expect(applyEdit('- item')).toEqual({ text: '- item\n- ', cursor: 9 })
  })

  it('increments ordered list markers', () => {
    expect(applyEdit('9. item')).toEqual({ text: '9. item\n10. ', cursor: 12 })
  })

  it('continues task lists as unchecked tasks', () => {
    expect(applyEdit('- [x] done')).toEqual({ text: '- [x] done\n- [ ] ', cursor: 17 })
  })

  it('preserves nested list indentation', () => {
    expect(applyEdit('  - nested')).toEqual({ text: '  - nested\n  - ', cursor: 15 })
  })

  it('exits an empty list item instead of creating another marker', () => {
    expect(applyEdit('- item\n- ')).toEqual({ text: '- item\n', cursor: 7 })
    expect(applyEdit('- [ ] ')).toEqual({ text: '', cursor: 0 })
  })

  it('does not treat fenced or indented code as Markdown lists', () => {
    expect(editFor('```\n- code\n```')).toBeNull()
    expect(editFor('    - code')).toBeNull()
  })
})
