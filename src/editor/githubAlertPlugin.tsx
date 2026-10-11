import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor
} from '@mdxeditor/editor'
import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedElementNode,
  type Spread
} from 'lexical'
import type { Blockquote, Paragraph, Text } from 'mdast'

export const GITHUB_ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const
export type GitHubAlertType = typeof GITHUB_ALERT_TYPES[number]

type SerializedGitHubAlertNode = Spread<{
  alertType: GitHubAlertType
  type: 'typeopen-github-alert'
  version: 1
}, SerializedElementNode>

interface TypeOpenAlertMdastNode {
  type: 'typeopenAlert'
  alertType: GitHubAlertType
  children: any[]
}

const ALERT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/

function alertLabel(type: GitHubAlertType): string {
  return type[0] + type.slice(1).toLocaleLowerCase()
}

export class GitHubAlertNode extends ElementNode {
  __alertType: GitHubAlertType

  static getType() { return 'typeopen-github-alert' }
  static clone(node: GitHubAlertNode) { return new GitHubAlertNode(node.__alertType, node.__key) }
  static importJSON(serialized: SerializedGitHubAlertNode) {
    return $createGitHubAlertNode(serialized.alertType).updateFromJSON(serialized)
  }

  constructor(alertType: GitHubAlertType = 'NOTE', key?: NodeKey) {
    super(key)
    this.__alertType = alertType
  }

  updateFromJSON(serialized: LexicalUpdateJSON<SerializedGitHubAlertNode>) {
    super.updateFromJSON(serialized)
    const writable = this.getWritable()
    writable.__alertType = normalizeGitHubAlertType(serialized.alertType)
    return writable
  }

  createDOM(_config: EditorConfig) {
    const element = document.createElement('div')
    applyAlertDOM(element, this.__alertType)
    return element
  }

  updateDOM(previous: GitHubAlertNode, dom: HTMLElement) {
    if (previous.__alertType !== this.__alertType) applyAlertDOM(dom, this.__alertType)
    return false
  }

  getAlertType() { return this.getLatest().__alertType }

  exportJSON(): SerializedGitHubAlertNode {
    return { ...super.exportJSON(), type: 'typeopen-github-alert', version: 1, alertType: this.getAlertType() }
  }
}

function applyAlertDOM(element: HTMLElement, type: GitHubAlertType) {
  element.className = `typeopen-github-alert typeopen-github-alert-${type.toLocaleLowerCase()}`
  element.dataset.alertType = type
  element.dataset.alertLabel = alertLabel(type)
}

export function normalizeGitHubAlertType(value: unknown): GitHubAlertType {
  const normalized = typeof value === 'string' ? value.toLocaleUpperCase() : ''
  return (GITHUB_ALERT_TYPES as readonly string[]).includes(normalized) ? normalized as GitHubAlertType : 'NOTE'
}

export function $createGitHubAlertNode(type: GitHubAlertType = 'NOTE') {
  return $applyNodeReplacement(new GitHubAlertNode(type))
}

export function $isGitHubAlertNode(node: LexicalNode | null | undefined): node is GitHubAlertNode {
  return node instanceof GitHubAlertNode
}

function parseGitHubAlert(node: Blockquote): { type: GitHubAlertType; content: Blockquote } | null {
  const firstParagraph = node.children[0]
  if (!firstParagraph || firstParagraph.type !== 'paragraph') return null
  const firstText = firstParagraph.children[0]
  if (!firstText || firstText.type !== 'text') return null
  const match = ALERT_PATTERN.exec(firstText.value)
  if (!match) return null

  const type = normalizeGitHubAlertType(match[1])
  const remainingText = firstText.value.slice(match[0].length)
  const paragraphChildren = [...firstParagraph.children]
  if (remainingText) paragraphChildren[0] = { ...firstText, value: remainingText } as Text
  else paragraphChildren.shift()

  const cleanedParagraph: Paragraph = { ...firstParagraph, children: paragraphChildren }
  const children = [...node.children]
  if (cleanedParagraph.children.length === 0 && children.length > 1) children.shift()
  else children[0] = cleanedParagraph

  return { type, content: { ...node, children } }
}

const importGitHubAlert: MdastImportVisitor<Blockquote> = {
  priority: 100,
  testNode: (node) => node.type === 'blockquote' && parseGitHubAlert(node as Blockquote) !== null,
  visitNode({ mdastNode, lexicalParent, actions }) {
    const parsed = parseGitHubAlert(mdastNode)
    if (!parsed || !(lexicalParent instanceof ElementNode)) return
    const alert = $createGitHubAlertNode(parsed.type)
    lexicalParent.append(alert)
    actions.visitChildren(parsed.content, alert)
  }
}

const exportGitHubAlert: LexicalExportVisitor<GitHubAlertNode, any> = {
  priority: 100,
  testLexicalNode: $isGitHubAlertNode,
  visitLexicalNode({ lexicalNode, mdastParent, actions }) {
    const alert: TypeOpenAlertMdastNode = { type: 'typeopenAlert', alertType: lexicalNode.getAlertType(), children: [] }
    actions.appendToParent(mdastParent, alert as any)
    actions.visitChildren(lexicalNode, alert as any)
  }
}

function alertToMarkdown(node: TypeOpenAlertMdastNode, _parent: unknown, state: any, info: any): string {
  const exit = state.enter('blockquote')
  const tracker = state.createTracker(info)
  tracker.move('> ')
  tracker.shift(2)
  const body = state.containerFlow(node, tracker.current())
  const content = `[!${node.alertType}]${body ? `\n${body}` : ''}`
  const value = state.indentLines(content, (line: string, _index: number, blank: boolean) => `>${blank ? '' : ' '}${line}`)
  exit()
  return value
}

const alertToMarkdownExtension: any = { handlers: { typeopenAlert: alertToMarkdown } }

export const typeOpenGitHubAlertPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addLexicalNode$]: GitHubAlertNode,
      [addImportVisitor$]: importGitHubAlert,
      [addExportVisitor$]: exportGitHubAlert,
      [addToMarkdownExtension$]: alertToMarkdownExtension
    })
  }
})
