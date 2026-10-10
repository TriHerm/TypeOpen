import type { ReactNode } from 'react'
import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor
} from '@mdxeditor/editor'
import {
  $applyNodeReplacement,
  DecoratorNode,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from 'lexical'
import type { Html, Parent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'

type SerializedHtmlCommentNode = Spread<{
  value: string
  inline: boolean
  type: 'typeopen-html-comment'
  version: 1
}, SerializedLexicalNode>

function isHtmlComment(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('<!--') && trimmed.endsWith('-->')
}

function placeholderValue(node: MdxJsxFlowElement | MdxJsxTextElement, token: string): string | null {
  if (node.name !== 'span' && node.name !== 'div') return null
  const attribute = node.attributes.find((candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === 'data-typeopen-comment')
  if (!attribute || typeof attribute.value !== 'string') return null
  const prefix = `${token}:`
  if (!attribute.value.startsWith(prefix)) return null
  try { return decodeURIComponent(attribute.value.slice(prefix.length)) } catch { return null }
}

export class HtmlCommentNode extends DecoratorNode<ReactNode> {
  __value: string
  __inline: boolean

  static getType() { return 'typeopen-html-comment' }
  static clone(node: HtmlCommentNode) { return new HtmlCommentNode(node.__value, node.__inline, node.__key) }
  static importJSON(serialized: SerializedHtmlCommentNode) {
    return $createHtmlCommentNode(serialized.value, serialized.inline)
  }

  constructor(value = '<!-- comment -->', inline = false, key?: NodeKey) {
    super(key)
    this.__value = value
    this.__inline = inline
  }

  createDOM(_config: EditorConfig) { return document.createElement(this.__inline ? 'span' : 'div') }
  updateDOM(previous: HtmlCommentNode) { return previous.__inline !== this.__inline }
  isInline() { return this.__inline }
  getValue() { return this.getLatest().__value }
  exportJSON(): SerializedHtmlCommentNode {
    return { type: 'typeopen-html-comment', version: 1, value: this.getValue(), inline: this.__inline }
  }
  exportDOM(): DOMExportOutput {
    // HTML comments intentionally produce no visible export DOM. The Markdown
    // serializer below keeps their exact source for persisted documents.
    return { element: null }
  }
  decorate() {
    return (
      <span className={`typeopen-html-comment ${this.__inline ? 'inline' : 'block'}`} contentEditable={false}>
        {this.getValue()}
      </span>
    )
  }
}

export function $createHtmlCommentNode(value: string, inline = false) {
  return $applyNodeReplacement(new HtmlCommentNode(value, inline))
}

export function $isHtmlCommentNode(node: LexicalNode | null | undefined): node is HtmlCommentNode {
  return node instanceof HtmlCommentNode
}

const importHtmlComment: MdastImportVisitor<Html> = {
  priority: 100,
  testNode: (node) => node.type === 'html' && isHtmlComment(node.value),
  visitNode({ mdastNode, mdastParent, lexicalParent }) {
    if (!(lexicalParent instanceof ElementNode)) return
    const inline = mdastParent?.type === 'paragraph'
    lexicalParent.append($createHtmlCommentNode(mdastNode.value, inline))
  }
}

const exportHtmlComment: LexicalExportVisitor<HtmlCommentNode, Html> = {
  priority: 100,
  testLexicalNode: $isHtmlCommentNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent as Parent, { type: 'html', value: lexicalNode.getValue() })
  }
}

export function typeOpenCommentPlugin(token: string) {
  const importEncodedHtmlComment: MdastImportVisitor<MdxJsxFlowElement | MdxJsxTextElement> = {
    priority: 200,
    testNode: (node) => (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && placeholderValue(node, token) !== null,
    visitNode({ mdastNode, lexicalParent }) {
      if (!(lexicalParent instanceof ElementNode)) return
      const value = placeholderValue(mdastNode, token)
      if (value === null) return
      lexicalParent.append($createHtmlCommentNode(value, mdastNode.type === 'mdxJsxTextElement'))
    }
  }

  return realmPlugin({
    init(realm) {
      realm.pubIn({
        [addLexicalNode$]: HtmlCommentNode,
        [addImportVisitor$]: [importEncodedHtmlComment, importHtmlComment],
        [addExportVisitor$]: exportHtmlComment
      })
    }
  })()
}
