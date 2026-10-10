import type { Nodes } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfmFootnote } from 'micromark-extension-gfm-footnote'
import { math } from 'micromark-extension-math'

interface CommentRange {
  start: number
  end: number
  value: string
  inline: boolean
}

let nextCommentToken = 0

export function createHtmlCommentToken(): string {
  nextCommentToken += 1
  return `typeopen-${Date.now().toString(36)}-${nextCommentToken.toString(36)}-${Math.random().toString(36).slice(2)}`
}

function collectComments(node: Nodes, parent: Nodes | null, ranges: CommentRange[]) {
  if (node.type === 'html') {
    const value = node.value.trim()
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (value.startsWith('<!--') && value.endsWith('-->') && typeof start === 'number' && typeof end === 'number') {
      ranges.push({ start, end, value: node.value, inline: parent?.type === 'paragraph' })
    }
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children as Nodes[]) collectComments(child, node, ranges)
  }
}

/**
 * MDXEditor's default HTML parser intentionally consumes HTML comments before
 * its Lexical visitors run. Encode only parsed comment nodes as inert, known
 * HTML elements while the rich editor is active. Source mode always receives
 * the user's literal Markdown.
 */
export function encodeHtmlCommentsForRichEditor(markdown: string, token: string): string {
  if (!markdown.includes('<!--')) return markdown
  let root
  try {
    root = fromMarkdown(markdown, {
      extensions: [gfmFootnote(), math()],
      mdastExtensions: [gfmFootnoteFromMarkdown(), mathFromMarkdown()]
    })
  } catch {
    return markdown
  }

  const ranges: CommentRange[] = []
  collectComments(root, null, ranges)
  if (!ranges.length) return markdown

  let encoded = markdown
  for (const range of ranges.sort((a, b) => b.start - a.start)) {
    const tag = range.inline ? 'span' : 'div'
    const value = `${token}:${encodeURIComponent(range.value)}`
    encoded = `${encoded.slice(0, range.start)}<${tag} data-typeopen-comment="${value}"></${tag}>${encoded.slice(range.end)}`
  }
  return encoded
}

export function decodeHtmlCommentsFromRichEditor(markdown: string, token: string): string {
  const prefix = `${token}:`
  return markdown.replace(
    /<(span|div)\s+data-typeopen-comment="([^"]*)"\s*><\/\1>/g,
    (match, _tag: string, value: string) => {
      if (!value.startsWith(prefix)) return match
      try { return decodeURIComponent(value.slice(prefix.length)) } catch { return match }
    }
  )
}
