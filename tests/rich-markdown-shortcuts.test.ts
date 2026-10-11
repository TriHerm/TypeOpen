import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  createEditor
} from 'lexical'
import { describe, expect, it } from 'vitest'
import { registerTypeOpenRichMarkdownShortcuts } from '../src/editor/richMarkdownShortcutsPlugin'

function createTestEditor() {
  const editor = createEditor({
    namespace: `typeopen-rich-shortcuts-${Math.random()}`,
    onError: (error) => { throw error }
  })
  const unregister = registerTypeOpenRichMarkdownShortcuts(editor)
  editor.update(() => {
    const paragraph = $createParagraphNode()
    $getRoot().append(paragraph)
    paragraph.selectEnd()
  }, { discrete: true })
  return { editor, unregister }
}

async function typeText(editor: ReturnType<typeof createEditor>, value: string) {
  for (const character of value) {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) throw new Error('Expected range selection')
      selection.insertText(character)
    }, { discrete: true })
    // registerMarkdownShortcuts reacts from an update listener and may schedule
    // its transform in a follow-up editor.update. Let that update settle before
    // simulating the next keystroke.
    await Promise.resolve()
  }
}

function readTextFormat(editor: ReturnType<typeof createEditor>) {
  return editor.getEditorState().read(() => {
    const paragraph = $getRoot().getFirstChildOrThrow()
    if (!$isElementNode(paragraph)) throw new Error('Expected paragraph element')
    const text = paragraph.getFirstChildOrThrow()
    if (!$isTextNode(text)) throw new Error('Expected text node')
    return {
      text: text.getTextContent(),
      highlight: text.hasFormat('highlight'),
      strikethrough: text.hasFormat('strikethrough'),
      bold: text.hasFormat('bold')
    }
  })
}

describe('TypeOpen rich Markdown shortcuts', () => {
  it('converts a completed ==highlight== marker pair into rich highlight formatting', async () => {
    const { editor, unregister } = createTestEditor()
    try {
      await typeText(editor, '==marked==')
      expect(readTextFormat(editor)).toEqual({
        text: 'marked',
        highlight: true,
        strikethrough: false,
        bold: false
      })
    } finally {
      unregister()
    }
  })

  it('converts a completed ~~strike~~ marker pair into rich strikethrough formatting', async () => {
    const { editor, unregister } = createTestEditor()
    try {
      await typeText(editor, '~~gone~~')
      expect(readTextFormat(editor)).toEqual({
        text: 'gone',
        highlight: false,
        strikethrough: true,
        bold: false
      })
    } finally {
      unregister()
    }
  })

  it('does not duplicate MDXEditor-owned bold shortcut handling', async () => {
    const { editor, unregister } = createTestEditor()
    try {
      await typeText(editor, '**bold**')
      expect(readTextFormat(editor)).toEqual({
        text: '**bold**',
        highlight: false,
        strikethrough: false,
        bold: false
      })
    } finally {
      unregister()
    }
  })
})
