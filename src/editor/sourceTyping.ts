import { syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec, type EditorState, type Extension, type SelectionRange } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'

interface SourceListEdit {
  changes: { from: number; to?: number; insert: string }
  selection: SelectionRange
}

function isListItemContext(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  const probe = Math.max(line.from, Math.min(line.to, pos > line.from ? pos - 1 : pos))
  let node = syntaxTree(state).resolveInner(probe, -1)
  let insideListItem = false
  while (node) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'CodeText') return false
    if (node.name === 'ListItem') insideListItem = true
    node = node.parent!
  }
  return insideListItem
}

export function markdownListContinuation(state: EditorState): SourceListEdit | null {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return null
  const pos = state.selection.main.head
  const line = state.doc.lineAt(pos)
  if (!isListItemContext(state, pos)) return null

  const beforeCursor = state.doc.sliceString(line.from, pos)
  const bullet = /^(\s*)([-+*])(\s+)(?:\[( |x|X)\](\s+))?(.*)$/.exec(beforeCursor)
  if (bullet) {
    const [, indent, marker, spacing, taskState, taskSpacing = '', content] = bullet
    const isTask = taskState !== undefined
    const continuation = `${indent}${marker}${spacing}${isTask ? `[ ]${taskSpacing}` : ''}`
    if (!content.trim()) {
      return {
        changes: { from: line.from, to: pos, insert: '' },
        selection: EditorSelection.cursor(line.from)
      }
    }
    const insert = `\n${continuation}`
    return {
      changes: { from: pos, insert },
      selection: EditorSelection.cursor(pos + insert.length)
    }
  }

  const ordered = /^(\s*)(\d+)(\.)(\s+)(.*)$/.exec(beforeCursor)
  if (!ordered) return null
  const [, indent, numberText, punctuation, spacing, content] = ordered
  if (!content.trim()) {
    return {
      changes: { from: line.from, to: pos, insert: '' },
      selection: EditorSelection.cursor(line.from)
    }
  }

  const nextNumber = Number(numberText) + 1
  const insert = `\n${indent}${nextNumber}${punctuation}${spacing}`
  return {
    changes: { from: pos, insert },
    selection: EditorSelection.cursor(pos + insert.length)
  }
}

export function continueMarkdownList(view: EditorView): boolean {
  const edit = markdownListContinuation(view.state)
  if (!edit) return false
  view.dispatch({ changes: edit.changes, selection: edit.selection, scrollIntoView: true })
  return true
}

export const TYPEOPEN_SOURCE_TYPING: Extension = Prec.high(keymap.of([
  { key: 'Enter', run: continueMarkdownList }
]))
