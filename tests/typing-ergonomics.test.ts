import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  createEditor,
  KEY_BACKSPACE_COMMAND,
  type LexicalCommand
} from 'lexical'
import { describe, expect, it } from 'vitest'
import { registerTypeOpenAutoPairing, shouldAutoPairKey } from '../src/editor/typingErgonomicsPlugin'

function createTestEditor(initialText = '') {
  const editor = createEditor({ namespace: `typeopen-typing-${Math.random()}`, onError: (error) => { throw error } })
  const unregisterAutoPair = registerTypeOpenAutoPairing(editor)

  editor.update(() => {
    const root = $getRoot()
    root.clear()
    const paragraph = $createParagraphNode()
    root.append(paragraph)
    if (initialText) {
      const text = $createTextNode(initialText)
      paragraph.append(text)
      text.select(initialText.length, initialText.length)
    } else {
      paragraph.selectEnd()
    }
  }, { discrete: true })

  return {
    editor,
    dispose() {
      unregisterAutoPair()
    }
  }
}

function readState(editor: ReturnType<typeof createEditor>) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return {
      text: $getRoot().getTextContent(),
      offset: $isRangeSelection(selection) ? selection.anchor.offset : -1
    }
  })
}

function dispatchKey(
  editor: ReturnType<typeof createEditor>,
  command: LexicalCommand<any>,
  payload: any
) {
  let handled = false
  editor.update(() => {
    handled = editor.dispatchCommand(command, payload)
  }, { discrete: true })
  return handled
}

describe('rich-text typing ergonomics', () => {
  it('pairs an opening bracket and keeps the caret between the pair', () => {
    const { editor, dispose } = createTestEditor()
    try {
      const handled = dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '(')
      expect(handled).toBe(true)
      expect(readState(editor)).toEqual({ text: '()', offset: 1 })
    } finally {
      dispose()
    }
  })

  it('skips an existing closing bracket instead of duplicating it', () => {
    const { editor, dispose } = createTestEditor()
    try {
      dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '[')
      const handled = dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, ']')
      expect(handled).toBe(true)
      expect(readState(editor)).toEqual({ text: '[]', offset: 2 })
    } finally {
      dispose()
    }
  })

  it('removes an empty auto-pair with one Backspace', () => {
    const { editor, dispose } = createTestEditor()
    try {
      dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '{')
      const handled = dispatchKey(editor, KEY_BACKSPACE_COMMAND, new KeyboardEvent('keydown', { key: 'Backspace' }))
      expect(handled).toBe(true)
      expect(readState(editor)).toEqual({ text: '', offset: 0 })
    } finally {
      dispose()
    }
  })

  it('does not turn an apostrophe after a word character into a pair', () => {
    expect(shouldAutoPairKey("'", 'n', '')).toBe(false)
    expect(shouldAutoPairKey('"', 'd', '')).toBe(false)
    expect(shouldAutoPairKey("'", '', '')).toBe(true)
  })

  it('does not intercept composing input', () => {
    const { editor, dispose } = createTestEditor()
    try {
      const event = new InputEvent('beforeinput', { data: '(', inputType: 'insertText', isComposing: true })
      expect(dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, event)).toBe(false)
      expect(readState(editor).text).toBe('')
    } finally {
      dispose()
    }
  })

  it('leaves Markdown link destination parentheses to the LINK transformer', () => {
    expect(shouldAutoPairKey('(', ']', '')).toBe(false)
    const { editor, dispose } = createTestEditor('[label]')
    try {
      expect(dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '(')).toBe(false)
      expect(readState(editor)).toEqual({ text: '[label]', offset: 7 })
      expect(dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, ')')).toBe(false)
    } finally {
      dispose()
    }
  })

  it('passes ordinary text and non-collapsed selections through untouched', () => {
    const { editor, dispose } = createTestEditor('word')
    try {
      expect(dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, 'a')).toBe(false)
      editor.update(() => {
        const paragraph = $getRoot().getFirstChildOrThrow()
        if (!$isElementNode(paragraph)) throw new Error('Expected paragraph element')
        const text = paragraph.getFirstChildOrThrow()
        if ($isTextNode(text)) text.select(0, 4)
      }, { discrete: true })
      expect(dispatchKey(editor, CONTROLLED_TEXT_INSERTION_COMMAND, '(')).toBe(false)
      expect(readState(editor).text).toBe('word')
    } finally {
      dispose()
    }
  })
})
