import { $createParagraphNode, $getRoot, createEditor } from 'lexical'
import { $createCodeBlockNode, CodeBlockNode } from '@mdxeditor/editor'
import { describe, expect, it, vi } from 'vitest'
import { registerCodeLanguageSessionObserver } from '../src/editor/codeLanguageSessionPlugin'

function createCodeEditor() {
  return createEditor({
    namespace: `typeopen-code-language-${Math.random()}`,
    nodes: [CodeBlockNode],
    onError: (error) => { throw error }
  })
}

function appendCodeBlock(editor: ReturnType<typeof createCodeEditor>, language: string) {
  let key = ''
  editor.update(() => {
    const node = $createCodeBlockNode({ language, code: 'code' })
    key = node.getKey()
    $getRoot().append(node, $createParagraphNode())
  }, { discrete: true })
  return key
}

function setCodeLanguage(editor: ReturnType<typeof createCodeEditor>, key: string, language: string) {
  editor.update(() => {
    const node = $getRoot().getChildren().find((candidate) => candidate.getKey() === key)
    if (!(node instanceof CodeBlockNode)) throw new Error('Expected code block')
    node.setLanguage(language)
  }, { discrete: true })
}

describe('session code language memory', () => {
  it('seeds existing and newly inserted blocks without treating them as user language changes', () => {
    const editor = createCodeEditor()
    appendCodeBlock(editor, 'js')
    const onLanguageUsed = vi.fn()
    const unregister = registerCodeLanguageSessionObserver(editor, onLanguageUsed)
    try {
      expect(onLanguageUsed).not.toHaveBeenCalled()
      appendCodeBlock(editor, 'python')
      expect(onLanguageUsed).not.toHaveBeenCalled()
    } finally {
      unregister()
    }
  })

  it('reports only later language mutations and normalizes unsupported values safely', () => {
    const editor = createCodeEditor()
    const key = appendCodeBlock(editor, 'js')
    const onLanguageUsed = vi.fn()
    const unregister = registerCodeLanguageSessionObserver(editor, onLanguageUsed)
    try {
      setCodeLanguage(editor, key, 'python')
      expect(onLanguageUsed).toHaveBeenLastCalledWith('python')

      setCodeLanguage(editor, key, 'unsupported-language')
      expect(onLanguageUsed).toHaveBeenLastCalledWith('text')
    } finally {
      unregister()
    }
  })
})
