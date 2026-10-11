import { createActiveEditorSubscription$, realmPlugin } from '@mdxeditor/editor'
import { HIGHLIGHT, registerMarkdownShortcuts, STRIKETHROUGH } from '@lexical/markdown'
import type { LexicalEditor } from 'lexical'

export function registerTypeOpenRichMarkdownShortcuts(editor: LexicalEditor) {
  // MDXEditor's markdownShortcutPlugin intentionally omits these two text
  // formats even though its core parser/serializer supports them. Register
  // only the missing public Lexical transformers so bold/italic/code/link
  // shortcuts remain owned by MDXEditor.
  return registerMarkdownShortcuts(editor, [HIGHLIGHT, STRIKETHROUGH])
}

export function typeOpenRichMarkdownShortcutsPlugin() {
  return realmPlugin({
    init(realm) {
      realm.pub(createActiveEditorSubscription$, registerTypeOpenRichMarkdownShortcuts)
    }
  })()
}
