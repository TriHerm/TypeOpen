import { useMemo, useState } from 'react'
import katex from 'katex'
import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor
} from '@mdxeditor/editor'
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode
} from 'lexical'
import { mathFromMarkdown, mathToMarkdown, type InlineMath, type Math } from 'mdast-util-math'
import { math } from 'micromark-extension-math'

interface SerializedMathNode extends SerializedLexicalNode {
  value: string
  type: 'typeopen-inline-math' | 'typeopen-block-math'
  version: 1
}

function FormulaView({ value, block, onCommit }: { value: string; block: boolean; onCommit: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const html = useMemo(() => {
    try {
      return katex.renderToString(value, { displayMode: block, throwOnError: false, output: 'htmlAndMathml' })
    } catch {
      return value
    }
  }, [block, value])

  const commit = () => {
    onCommit(draft)
    setEditing(false)
  }

  if (editing) {
    return block ? (
      <textarea
        className="typeopen-math-editor block"
        autoFocus
        rows={Math.max(2, Math.min(8, draft.split('\n').length + 1))}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') commit()
          if (event.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    ) : (
      <input
        className="typeopen-math-editor inline"
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
      />
    )
  }

  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      className={block ? 'typeopen-math-node block' : 'typeopen-math-node inline'}
      title="Double-click to edit TeX"
      onDoubleClick={() => { setDraft(value); setEditing(true) }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

class InlineMathNode extends DecoratorNode<React.JSX.Element> {
  __value: string

  static getType() { return 'typeopen-inline-math' }
  static clone(node: InlineMathNode) { return new InlineMathNode(node.__value, node.__key) }
  static importJSON(serialized: SerializedLexicalNode & Record<string, unknown>) {
    return new InlineMathNode(typeof serialized.value === 'string' ? serialized.value : '')
  }
  constructor(value: string, key?: NodeKey) { super(key); this.__value = value }
  createDOM() { return document.createElement('span') }
  updateDOM() { return false as const }
  isInline() { return true }
  getValue() { return this.__value }
  setValue(value: string) { this.getWritable().__value = value }
  exportJSON(): SerializedMathNode { return { ...super.exportJSON(), type: 'typeopen-inline-math', version: 1, value: this.__value } }
  exportDOM(): DOMExportOutput { return { element: document.createTextNode(`$${this.__value}$`) } }
  decorate(editor: LexicalEditor) {
    return <FormulaView value={this.__value} block={false} onCommit={(value) => editor.update(() => this.setValue(value))} />
  }
}

class BlockMathNode extends DecoratorNode<React.JSX.Element> {
  __value: string

  static getType() { return 'typeopen-block-math' }
  static clone(node: BlockMathNode) { return new BlockMathNode(node.__value, node.__key) }
  static importJSON(serialized: SerializedLexicalNode & Record<string, unknown>) {
    return new BlockMathNode(typeof serialized.value === 'string' ? serialized.value : '')
  }
  constructor(value: string, key?: NodeKey) { super(key); this.__value = value }
  createDOM() { return document.createElement('div') }
  updateDOM() { return false as const }
  isInline() { return false }
  getValue() { return this.__value }
  setValue(value: string) { this.getWritable().__value = value }
  exportJSON(): SerializedMathNode { return { ...super.exportJSON(), type: 'typeopen-block-math', version: 1, value: this.__value } }
  exportDOM(): DOMExportOutput { return { element: document.createTextNode(`$$\n${this.__value}\n$$`) } }
  decorate(editor: LexicalEditor) {
    return <FormulaView value={this.__value} block onCommit={(value) => editor.update(() => this.setValue(value))} />
  }
}

function createInlineMath(value: string) { return $applyNodeReplacement(new InlineMathNode(value)) }
function createBlockMath(value: string) { return $applyNodeReplacement(new BlockMathNode(value)) }
function isInlineMath(node: LexicalNode | null | undefined): node is InlineMathNode { return node instanceof InlineMathNode }
function isBlockMath(node: LexicalNode | null | undefined): node is BlockMathNode { return node instanceof BlockMathNode }

const importInlineMath: MdastImportVisitor<InlineMath> = {
  testNode: (node) => node.type === 'inlineMath',
  visitNode({ mdastNode, actions }) { actions.addAndStepInto(createInlineMath(mdastNode.value)) }
}

const importBlockMath: MdastImportVisitor<Math> = {
  testNode: (node) => node.type === 'math',
  visitNode({ mdastNode, actions }) { actions.addAndStepInto(createBlockMath(mdastNode.value)) }
}

const exportInlineMath: LexicalExportVisitor<InlineMathNode, InlineMath> = {
  testLexicalNode: isInlineMath,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, { type: 'inlineMath', value: lexicalNode.getValue() })
  }
}

const exportBlockMath: LexicalExportVisitor<BlockMathNode, Math> = {
  testLexicalNode: isBlockMath,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, { type: 'math', value: lexicalNode.getValue() })
  }
}

export const typeOpenMathPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: math(),
      [addMdastExtension$]: mathFromMarkdown(),
      [addToMarkdownExtension$]: mathToMarkdown(),
      [addImportVisitor$]: [importInlineMath, importBlockMath],
      [addExportVisitor$]: [exportInlineMath, exportBlockMath],
      [addLexicalNode$]: [InlineMathNode, BlockMathNode]
    })
  }
})
