import { CodeBlockNode, createActiveEditorSubscription$, realmPlugin } from '@mdxeditor/editor'
import { $nodesOfType, type LexicalEditor } from 'lexical'
import { normalizeCodeBlockLanguage, type CodeBlockLanguage } from '../lib/codeLanguages'

export function registerCodeLanguageSessionObserver(
  editor: LexicalEditor,
  onLanguageUsed: (language: CodeBlockLanguage) => void
) {
  const known = new Map<string, string>()

  const readLanguages = () => {
    const currentKeys = new Set<string>()
    for (const node of $nodesOfType(CodeBlockNode)) {
      const key = node.getKey()
      const language = node.getLanguage()
      currentKeys.add(key)
      const previous = known.get(key)
      if (previous === undefined) {
        known.set(key, language)
      } else if (previous !== language) {
        known.set(key, language)
        onLanguageUsed(normalizeCodeBlockLanguage(language))
      }
    }
    for (const key of known.keys()) {
      if (!currentKeys.has(key)) known.delete(key)
    }
  }

  editor.getEditorState().read(readLanguages)
  return editor.registerUpdateListener(({ editorState }) => {
    editorState.read(readLanguages)
  })
}

export function typeOpenCodeLanguageSessionPlugin(onLanguageUsed: (language: CodeBlockLanguage) => void) {
  return realmPlugin({
    init(realm) {
      realm.pub(createActiveEditorSubscription$, (editor) => registerCodeLanguageSessionObserver(editor, onLanguageUsed))
    }
  })()
}
