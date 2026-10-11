import { createActiveEditorSubscription$, realmPlugin } from '@mdxeditor/editor'
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_BACKSPACE_COMMAND,
  mergeRegister,
  type LexicalEditor
} from 'lexical'

const PAIRS = new Map<string, string>([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['"', '"'],
  ["'", "'"]
])

const CLOSERS = new Set(PAIRS.values())
const WORD_CHARACTER = /[\p{L}\p{N}_]/u

function textContext() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') return null
  const node = selection.anchor.getNode()
  if (!$isTextNode(node)) return null
  const offset = selection.anchor.offset
  const text = node.getTextContent()
  return {
    node,
    offset,
    previous: offset > 0 ? text[offset - 1] : '',
    next: offset < text.length ? text[offset] : ''
  }
}

export function shouldAutoPairKey(key: string, previous: string, next: string): boolean {
  if (!PAIRS.has(key)) return false
  // Let Lexical's Markdown LINK transformer own `[label](url)` completion.
  // Pairing `(` after `]` would pre-insert the final `)` and closer-skip would
  // prevent the transformer's `)` trigger from ever being typed.
  if (key === '(' && previous === ']') return false
  if ((key === '"' || key === "'") && WORD_CHARACTER.test(previous)) return false
  if (next === key && CLOSERS.has(key)) return false
  return true
}

export function registerTypeOpenAutoPairing(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      CONTROLLED_TEXT_INSERTION_COMMAND,
      (eventOrText) => {
        if (editor.isComposing()) return false
        if (typeof eventOrText !== 'string' && eventOrText.isComposing) return false
        const inserted = typeof eventOrText === 'string' ? eventOrText : eventOrText.data
        if (typeof inserted !== 'string' || [...inserted].length !== 1) return false

        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
        const context = textContext()

        if (context && CLOSERS.has(inserted) && context.next === inserted) {
          context.node.select(context.offset + 1, context.offset + 1)
          return true
        }

        const closer = PAIRS.get(inserted)
        if (!closer || !shouldAutoPairKey(inserted, context?.previous ?? '', context?.next ?? '')) return false

        selection.insertText(`${inserted}${closer}`)

        const updated = $getSelection()
        if ($isRangeSelection(updated) && updated.isCollapsed() && updated.anchor.type === 'text') {
          const node = updated.anchor.getNode()
          if ($isTextNode(node)) {
            const offset = Math.max(0, updated.anchor.offset - closer.length)
            node.select(offset, offset)
          }
        }
        return true
      },
      COMMAND_PRIORITY_LOW
    ),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return false
        const context = textContext()
        if (!context || context.offset === 0 || PAIRS.get(context.previous) !== context.next) return false

        event.preventDefault()
        context.node.spliceText(context.offset - 1, 2, '', true)
        context.node.select(context.offset - 1, context.offset - 1)
        return true
      },
      COMMAND_PRIORITY_LOW
    )
  )
}

export function typeOpenTypingErgonomicsPlugin(enabled: boolean) {
  return realmPlugin({
    init(realm) {
      if (!enabled) return
      realm.pub(createActiveEditorSubscription$, registerTypeOpenAutoPairing)
    }
  })()
}
