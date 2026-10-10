import { useEffect, useState, type ReactNode } from 'react'
import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor
} from '@mdxeditor/editor'
import { HeadingNode } from '@lexical/rich-text'
import {
  $applyNodeReplacement,
  $nodesOfType,
  DecoratorNode,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from 'lexical'

interface TocItem {
  key: string
  level: number
  text: string
}

type SerializedTableOfContentsNode = Spread<{ type: 'typeopen-toc'; version: 1 }, SerializedLexicalNode>

function TableOfContentsView({ editor }: { editor: LexicalEditor }) {
  const [items, setItems] = useState<TocItem[]>([])

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      setItems($nodesOfType(HeadingNode).map((node) => ({
        key: node.getKey(),
        level: Number(node.getTag().slice(1)),
        text: node.getTextContent()
      })).filter((item) => item.text.trim().length > 0))
    })
  }), [editor])

  useEffect(() => {
    editor.getEditorState().read(() => {
      setItems($nodesOfType(HeadingNode).map((node) => ({
        key: node.getKey(),
        level: Number(node.getTag().slice(1)),
        text: node.getTextContent()
      })).filter((item) => item.text.trim().length > 0))
    })
  }, [editor])

  return (
    <nav className="typeopen-live-toc" contentEditable={false} aria-label="Table of contents">
      <div className="typeopen-live-toc-title">Table of Contents</div>
      {items.length === 0
        ? <div className="typeopen-live-toc-empty">Add headings to populate this table of contents.</div>
        : items.map((item) => (
          <button
            key={item.key}
            type="button"
            style={{ paddingInlineStart: `${8 + (item.level - 1) * 14}px` }}
            onClick={() => editor.getElementByKey(item.key)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
          >
            {item.text}
          </button>
        ))}
    </nav>
  )
}

export class TableOfContentsNode extends DecoratorNode<ReactNode> {
  static getType() { return 'typeopen-toc' }
  static clone(node: TableOfContentsNode) { return new TableOfContentsNode(node.__key) }
  static importJSON(_serialized: SerializedTableOfContentsNode) { return $createTableOfContentsNode() }

  constructor(key?: NodeKey) { super(key) }
  createDOM(_config: EditorConfig) { return document.createElement('div') }
  updateDOM() { return false }
  exportDOM(): DOMExportOutput { return { element: null } }
  exportJSON(): SerializedTableOfContentsNode { return { type: 'typeopen-toc', version: 1 } }
  isInline() { return false }
  decorate(editor: LexicalEditor) { return <TableOfContentsView editor={editor} /> }
}

export function $createTableOfContentsNode() {
  return $applyNodeReplacement(new TableOfContentsNode())
}

export function $isTableOfContentsNode(node: LexicalNode | null | undefined): node is TableOfContentsNode {
  return node instanceof TableOfContentsNode
}

const tocImportVisitor: MdastImportVisitor<any> = {
  priority: 100,
  testNode: (node) => node.type === 'paragraph' && node.children?.length === 1 && node.children[0]?.type === 'text' && node.children[0]?.value === '[TOC]',
  visitNode({ lexicalParent }) { (lexicalParent as ElementNode).append($createTableOfContentsNode()) }
}

const tocExportVisitor: LexicalExportVisitor<TableOfContentsNode, any> = {
  priority: 100,
  testLexicalNode: $isTableOfContentsNode,
  visitLexicalNode({ mdastParent, actions }) {
    actions.appendToParent(mdastParent, { type: 'typeopenToc' } as any)
  }
}

const tocToMarkdownExtension: any = {
  handlers: {
    typeopenToc: () => '[TOC]'
  }
}

export const typeOpenTocPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: TableOfContentsNode,
      [addImportVisitor$]: tocImportVisitor,
      [addExportVisitor$]: tocExportVisitor,
      [addToMarkdownExtension$]: tocToMarkdownExtension
    })
  }
})
