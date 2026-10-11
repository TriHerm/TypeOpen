import {
  addExportVisitor$,
  realmPlugin,
  type LexicalExportVisitor
} from '@mdxeditor/editor'
import { $isLineBreakNode, type LineBreakNode } from 'lexical'
import type { Break } from 'mdast'

const exportHardBreak: LexicalExportVisitor<LineBreakNode, Break> = {
  priority: 100,
  testLexicalNode: $isLineBreakNode,
  visitLexicalNode({ mdastParent, actions }) {
    actions.appendToParent(mdastParent, { type: 'break' })
  }
}

export const typeOpenHardBreakPlugin = realmPlugin({
  init(realm) {
    // MDXEditor imports MDAST `break` as a Lexical LineBreakNode, but its
    // default export visitor emits that node as plain "\n" text. Override only
    // that export step so an explicit rich line break remains a Markdown hard
    // break instead of silently degrading to a soft line break.
    realm.pub(addExportVisitor$, exportHardBreak)
  }
})
