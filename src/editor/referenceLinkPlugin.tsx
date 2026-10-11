import type { ReactNode } from 'react'
import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  createActiveEditorSubscription$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor
} from '@mdxeditor/editor'
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $nodesOfType,
  DecoratorNode,
  ElementNode,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedElementNode,
  type SerializedLexicalNode,
  type Spread
} from 'lexical'
import type { Definition, LinkReference, Parent, Root } from 'mdast'

type ReferenceType = LinkReference['referenceType']

type SerializedReferenceLinkNode = Spread<{
  identifier: string
  label: string
  referenceType: ReferenceType
  title: string | null
  type: 'typeopen-reference-link'
  url: string
  version: 1
}, SerializedElementNode>

type SerializedReferenceDefinitionNode = Spread<{
  identifier: string
  label: string
  title: string | null
  type: 'typeopen-reference-definition'
  url: string
  version: 1
}, SerializedLexicalNode>

const referenceDefinitions = new WeakMap<object, Map<string, Definition>>()
const SAFE_REFERENCE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'sms:', 'tel:'])

function safeReferenceUrl(url: string) {
  // Relative URLs and fragments are valid Markdown destinations. Only neutralize
  // an explicit non-allowlisted scheme, including C0/whitespace-obfuscated forms.
  // eslint-disable-next-line no-control-regex
  const normalized = url.replace(/[\u0000-\u001F\u007F\s]/g, '')
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]
  if (scheme && !SAFE_REFERENCE_PROTOCOLS.has(`${scheme.toLowerCase()}:`)) return 'about:blank'
  return url
}

function collectDefinitions(node: Parent, definitions: Map<string, Definition>) {
  for (const child of node.children) {
    if (child.type === 'definition') {
      if (!definitions.has(child.identifier)) definitions.set(child.identifier, child)
      continue
    }
    if ('children' in child) collectDefinitions(child as Parent, definitions)
  }
}

function definitionDisplay(label: string, url: string, title: string | null) {
  return `[${label}]: ${url}${title !== null ? ` "${title}"` : ''}`
}

function collectLiveDefinitions(node: LexicalNode, definitions: Map<string, ReferenceDefinitionNode>) {
  if ($isReferenceDefinitionNode(node)) {
    if (!definitions.has(node.getIdentifier())) definitions.set(node.getIdentifier(), node)
    return
  }
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) collectLiveDefinitions(child, definitions)
  }
}

export class ReferenceLinkNode extends ElementNode {
  __identifier: string
  __label: string
  __referenceType: ReferenceType
  __url: string
  __title: string | null

  static getType() { return 'typeopen-reference-link' }
  static clone(node: ReferenceLinkNode) {
    return new ReferenceLinkNode(node.__identifier, node.__label, node.__referenceType, node.__url, node.__title, node.__key)
  }
  static importJSON(serialized: SerializedReferenceLinkNode) {
    return $createReferenceLinkNode().updateFromJSON(serialized)
  }

  constructor(identifier = '', label = identifier, referenceType: ReferenceType = 'full', url = '', title: string | null = null, key?: NodeKey) {
    super(key)
    this.__identifier = identifier
    this.__label = label
    this.__referenceType = referenceType
    this.__url = url
    this.__title = title
  }

  updateFromJSON(serialized: LexicalUpdateJSON<SerializedReferenceLinkNode>) {
    super.updateFromJSON(serialized)
    const writable = this.getWritable()
    writable.__identifier = serialized.identifier
    writable.__label = serialized.label
    writable.__referenceType = serialized.referenceType
    writable.__url = serialized.url
    writable.__title = serialized.title
    return writable
  }

  createDOM(_config: EditorConfig) {
    const element = document.createElement('a')
    element.className = 'typeopen-reference-link'
    if (this.__url) element.setAttribute('href', safeReferenceUrl(this.__url))
    if (this.__title) element.setAttribute('title', this.__title)
    element.dataset.referenceIdentifier = this.__identifier
    return element
  }

  updateDOM(previous: ReferenceLinkNode, dom: HTMLAnchorElement) {
    if (previous.__url !== this.__url) {
      if (this.__url) dom.setAttribute('href', safeReferenceUrl(this.__url))
      else dom.removeAttribute('href')
    }
    if (previous.__title !== this.__title) {
      if (this.__title) dom.setAttribute('title', this.__title)
      else dom.removeAttribute('title')
    }
    if (previous.__identifier !== this.__identifier) dom.dataset.referenceIdentifier = this.__identifier
    return false
  }

  isInline() { return true as const }
  canBeEmpty() { return false }
  getIdentifier() { return this.getLatest().__identifier }
  getLabel() { return this.getLatest().__label }
  getReferenceType() { return this.getLatest().__referenceType }
  getURL() { return this.getLatest().__url }
  getTitle() { return this.getLatest().__title }
  setResolvedDefinition(url: string, title: string | null) {
    const writable = this.getWritable()
    writable.__url = url
    writable.__title = title
    return writable
  }
  exportJSON(): SerializedReferenceLinkNode {
    return {
      ...super.exportJSON(),
      type: 'typeopen-reference-link',
      version: 1,
      identifier: this.getIdentifier(),
      label: this.getLabel(),
      referenceType: this.getReferenceType(),
      url: this.getURL(),
      title: this.getTitle()
    }
  }
}

export class ReferenceDefinitionNode extends DecoratorNode<ReactNode> {
  __identifier: string
  __label: string
  __url: string
  __title: string | null

  static getType() { return 'typeopen-reference-definition' }
  static clone(node: ReferenceDefinitionNode) {
    return new ReferenceDefinitionNode(node.__identifier, node.__label, node.__url, node.__title, node.__key)
  }
  static importJSON(serialized: SerializedReferenceDefinitionNode) {
    return $createReferenceDefinitionNode(serialized.identifier, serialized.label, serialized.url, serialized.title)
  }

  constructor(identifier = '', label = identifier, url = '', title: string | null = null, key?: NodeKey) {
    super(key)
    this.__identifier = identifier
    this.__label = label
    this.__url = url
    this.__title = title
  }

  createDOM() {
    const element = document.createElement('div')
    element.className = 'typeopen-reference-definition'
    element.dataset.referenceLabel = this.__label
    return element
  }
  updateDOM(previous: ReferenceDefinitionNode, dom: HTMLElement) {
    if (previous.__label !== this.__label) dom.dataset.referenceLabel = this.__label
    return false
  }
  isInline() { return false }
  getIdentifier() { return this.getLatest().__identifier }
  getLabel() { return this.getLatest().__label }
  getURL() { return this.getLatest().__url }
  getTitle() { return this.getLatest().__title }
  exportJSON(): SerializedReferenceDefinitionNode {
    return {
      ...super.exportJSON(),
      type: 'typeopen-reference-definition',
      version: 1,
      identifier: this.getIdentifier(),
      label: this.getLabel(),
      url: this.getURL(),
      title: this.getTitle()
    }
  }
  exportDOM(): DOMExportOutput {
    return { element: document.createTextNode(definitionDisplay(this.getLabel(), this.getURL(), this.getTitle())) }
  }
  decorate() {
    return <code contentEditable={false}>{definitionDisplay(this.getLabel(), this.getURL(), this.getTitle())}</code>
  }
}

export function $createReferenceLinkNode(identifier = '', label = identifier, referenceType: ReferenceType = 'full', url = '', title: string | null = null) {
  return $applyNodeReplacement(new ReferenceLinkNode(identifier, label, referenceType, url, title))
}

export function $isReferenceLinkNode(node: LexicalNode | null | undefined): node is ReferenceLinkNode {
  return node instanceof ReferenceLinkNode
}

export function $createReferenceDefinitionNode(identifier = '', label = identifier, url = '', title: string | null = null) {
  return $applyNodeReplacement(new ReferenceDefinitionNode(identifier, label, url, title))
}

export function $isReferenceDefinitionNode(node: LexicalNode | null | undefined): node is ReferenceDefinitionNode {
  return node instanceof ReferenceDefinitionNode
}

const collectReferenceDefinitions: MdastImportVisitor<Root> = {
  priority: 100,
  testNode: 'root',
  visitNode({ mdastNode, metaData, actions }) {
    const definitions = new Map<string, Definition>()
    collectDefinitions(mdastNode, definitions)
    referenceDefinitions.set(metaData as object, definitions)
    actions.nextVisitor()
  }
}

const importReferenceLink: MdastImportVisitor<LinkReference> = {
  priority: 100,
  testNode: 'linkReference',
  visitNode({ mdastNode, metaData, actions }) {
    const definition = referenceDefinitions.get(metaData as object)?.get(mdastNode.identifier)
    actions.addAndStepInto($createReferenceLinkNode(
      mdastNode.identifier,
      mdastNode.label || mdastNode.identifier,
      mdastNode.referenceType,
      definition?.url ?? '',
      definition?.title ?? null
    ))
  }
}

const importReferenceDefinition: MdastImportVisitor<Definition> = {
  priority: 100,
  testNode: 'definition',
  visitNode({ mdastNode, lexicalParent }) {
    ;(lexicalParent as ElementNode).append($createReferenceDefinitionNode(
      mdastNode.identifier,
      mdastNode.label || mdastNode.identifier,
      mdastNode.url,
      mdastNode.title ?? null
    ))
  }
}

const exportReferenceLink: LexicalExportVisitor<ReferenceLinkNode, LinkReference> = {
  priority: 100,
  testLexicalNode: $isReferenceLinkNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto('linkReference', {
      identifier: lexicalNode.getIdentifier(),
      label: lexicalNode.getLabel(),
      referenceType: lexicalNode.getReferenceType()
    })
  }
}

const exportReferenceDefinition: LexicalExportVisitor<ReferenceDefinitionNode, Definition> = {
  priority: 100,
  testLexicalNode: $isReferenceDefinitionNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    actions.appendToParent(mdastParent, {
      type: 'definition',
      identifier: lexicalNode.getIdentifier(),
      label: lexicalNode.getLabel(),
      url: lexicalNode.getURL(),
      title: lexicalNode.getTitle()
    })
  }
}

export function registerReferenceLinkDefinitionSync(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) => {
    const pending: Array<{ key: string; url: string; title: string | null }> = []

    editorState.read(() => {
      const definitions = new Map<string, ReferenceDefinitionNode>()
      collectLiveDefinitions($getRoot(), definitions)

      for (const link of $nodesOfType(ReferenceLinkNode)) {
        const definition = definitions.get(link.getIdentifier())
        const url = definition?.getURL() ?? ''
        const title = definition?.getTitle() ?? null
        if (link.getURL() !== url || link.getTitle() !== title) pending.push({ key: link.getKey(), url, title })
      }
    })

    if (pending.length === 0) return
    editor.update(() => {
      for (const update of pending) {
        const node = $getNodeByKey(update.key)
        if ($isReferenceLinkNode(node)) node.setResolvedDefinition(update.url, update.title)
      }
    })
  })
}

export const typeOpenReferenceLinkPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: [ReferenceLinkNode, ReferenceDefinitionNode],
      [addImportVisitor$]: [collectReferenceDefinitions, importReferenceLink, importReferenceDefinition],
      [addExportVisitor$]: [exportReferenceLink, exportReferenceDefinition]
    })
    realm.pub(createActiveEditorSubscription$, registerReferenceLinkDefinitionSync)
  }
})
