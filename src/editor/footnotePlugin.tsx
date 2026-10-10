import type { ReactNode } from 'react'
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
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedElementNode,
  type SerializedLexicalNode,
  type Spread
} from 'lexical'
import type { FootnoteDefinition, FootnoteReference } from 'mdast'
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from 'mdast-util-gfm-footnote'
import { gfmFootnote } from 'micromark-extension-gfm-footnote'

type SerializedFootnoteReferenceNode = Spread<{
  identifier: string
  label: string
  type: 'typeopen-footnote-reference'
  version: 1
}, SerializedLexicalNode>

type SerializedFootnoteDefinitionNode = Spread<{
  identifier: string
  label: string
  type: 'typeopen-footnote-definition'
  version: 1
}, SerializedElementNode>

export class FootnoteReferenceNode extends DecoratorNode<ReactNode> {
  __identifier: string
  __label: string

  static getType() { return 'typeopen-footnote-reference' }
  static clone(node: FootnoteReferenceNode) { return new FootnoteReferenceNode(node.__identifier, node.__label, node.__key) }
  static importJSON(serialized: SerializedFootnoteReferenceNode) {
    return $createFootnoteReferenceNode(serialized.identifier, serialized.label)
  }

  constructor(identifier = '', label = identifier, key?: NodeKey) {
    super(key)
    this.__identifier = identifier
    this.__label = label
  }

  createDOM() { return document.createElement('span') }
  updateDOM() { return false as const }
  isInline() { return true }
  getIdentifier() { return this.getLatest().__identifier }
  getLabel() { return this.getLatest().__label }
  exportJSON(): SerializedFootnoteReferenceNode {
    return { ...super.exportJSON(), type: 'typeopen-footnote-reference', version: 1, identifier: this.getIdentifier(), label: this.getLabel() }
  }
  exportDOM(): DOMExportOutput { return { element: document.createTextNode(`[^${this.getLabel()}]`) } }
  decorate() {
    return <sup className="typeopen-footnote-reference" contentEditable={false}>{`[^${this.getLabel()}]`}</sup>
  }
}

export class FootnoteDefinitionNode extends ElementNode {
  __identifier: string
  __label: string

  static getType() { return 'typeopen-footnote-definition' }
  static clone(node: FootnoteDefinitionNode) { return new FootnoteDefinitionNode(node.__identifier, node.__label, node.__key) }
  static importJSON(serialized: SerializedFootnoteDefinitionNode) {
    return $createFootnoteDefinitionNode().updateFromJSON(serialized)
  }

  constructor(identifier = '', label = identifier, key?: NodeKey) {
    super(key)
    this.__identifier = identifier
    this.__label = label
  }

  updateFromJSON(serialized: LexicalUpdateJSON<SerializedFootnoteDefinitionNode>) {
    super.updateFromJSON(serialized)
    const writable = this.getWritable()
    writable.__identifier = serialized.identifier
    writable.__label = serialized.label
    return writable
  }
  createDOM(_config: EditorConfig) {
    const element = document.createElement('div')
    element.className = 'typeopen-footnote-definition'
    element.dataset.footnoteLabel = this.__label
    return element
  }
  updateDOM(previous: FootnoteDefinitionNode, dom: HTMLElement) {
    if (previous.__label !== this.__label) dom.dataset.footnoteLabel = this.__label
    return false
  }
  getIdentifier() { return this.getLatest().__identifier }
  getLabel() { return this.getLatest().__label }
  exportJSON(): SerializedFootnoteDefinitionNode {
    return { ...super.exportJSON(), type: 'typeopen-footnote-definition', version: 1, identifier: this.getIdentifier(), label: this.getLabel() }
  }
}

export function $createFootnoteReferenceNode(identifier = '', label = identifier) {
  return $applyNodeReplacement(new FootnoteReferenceNode(identifier, label))
}

export function $isFootnoteReferenceNode(node: LexicalNode | null | undefined): node is FootnoteReferenceNode {
  return node instanceof FootnoteReferenceNode
}

export function $createFootnoteDefinitionNode(identifier = '', label = identifier) {
  return $applyNodeReplacement(new FootnoteDefinitionNode(identifier, label))
}

export function $isFootnoteDefinitionNode(node: LexicalNode | null | undefined): node is FootnoteDefinitionNode {
  return node instanceof FootnoteDefinitionNode
}

const importFootnoteReference: MdastImportVisitor<FootnoteReference> = {
  testNode: 'footnoteReference',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto($createFootnoteReferenceNode(mdastNode.identifier, mdastNode.label || mdastNode.identifier))
  }
}

const importFootnoteDefinition: MdastImportVisitor<FootnoteDefinition> = {
  testNode: 'footnoteDefinition',
  visitNode({ mdastNode, actions }) {
    actions.addAndStepInto($createFootnoteDefinitionNode(mdastNode.identifier, mdastNode.label || mdastNode.identifier))
  }
}

const exportFootnoteReference: LexicalExportVisitor<FootnoteReferenceNode, FootnoteReference> = {
  testLexicalNode: $isFootnoteReferenceNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: 'footnoteReference',
      identifier: lexicalNode.getIdentifier(),
      label: lexicalNode.getLabel()
    })
  }
}

const exportFootnoteDefinition: LexicalExportVisitor<FootnoteDefinitionNode, FootnoteDefinition> = {
  testLexicalNode: $isFootnoteDefinitionNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto('footnoteDefinition', {
      identifier: lexicalNode.getIdentifier(),
      label: lexicalNode.getLabel()
    })
  }
}

export const typeOpenFootnotePlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: gfmFootnote(),
      [addMdastExtension$]: gfmFootnoteFromMarkdown(),
      [addToMarkdownExtension$]: gfmFootnoteToMarkdown(),
      [addLexicalNode$]: [FootnoteReferenceNode, FootnoteDefinitionNode],
      [addImportVisitor$]: [importFootnoteReference, importFootnoteDefinition],
      [addExportVisitor$]: [exportFootnoteReference, exportFootnoteDefinition]
    })
  }
})
