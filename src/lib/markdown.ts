import DOMPurify from 'dompurify'
import flowchart from 'flowchart.js'
import katex from 'katex'
import { marked } from 'marked'
import mermaid from 'mermaid'

export interface OutlineItem {
  level: number
  text: string
  line: number
  slug: string
}

export interface OutlineTreeItem extends OutlineItem {
  children: OutlineTreeItem[]
}

export interface DocumentStats {
  words: number
  characters: number
  charactersNoSpaces: number
  lines: number
  readingMinutes: number
}

export interface ExportOptions {
  title?: string
  includeOutline?: boolean
  theme?: 'light' | 'dark'
  maxWidth?: number
}

export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_~[\](){}<>]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section'
}

export function extractOutline(markdown: string): OutlineItem[] {
  const result: OutlineItem[] = []
  const slugCounts = new Map<string, number>()
  const lines = markdown.split(/\r?\n/)
  let inFence = false
  let fenceChar = ''

  lines.forEach((line, index) => {
    const fence = /^\s*(```+|~~~+)/.exec(line)
    if (fence) {
      const char = fence[1][0]
      if (!inFence) {
        inFence = true
        fenceChar = char
      } else if (char === fenceChar) {
        inFence = false
        fenceChar = ''
      }
      return
    }
    if (inFence) return

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) return
    const text = match[2].replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '').trim()
    const base = slugifyHeading(text)
    const count = (slugCounts.get(base) || 0) + 1
    slugCounts.set(base, count)
    result.push({
      level: match[1].length,
      text,
      line: index + 1,
      slug: count === 1 ? base : `${base}-${count}`
    })
  })
  return result
}

export function buildOutlineTree(items: OutlineItem[]): OutlineTreeItem[] {
  const roots: OutlineTreeItem[] = []
  const stack: OutlineTreeItem[] = []

  for (const item of items) {
    const node: OutlineTreeItem = { ...item, children: [] }
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop()
    const parent = stack.at(-1)
    if (parent) parent.children.push(node)
    else roots.push(node)
    stack.push(node)
  }

  return roots
}

export function outlineAncestorSlugs(items: OutlineTreeItem[], targetSlug: string): string[] {
  const ancestors: string[] = []
  const visit = (nodes: OutlineTreeItem[]): boolean => {
    for (const node of nodes) {
      if (node.slug === targetSlug) return true
      ancestors.push(node.slug)
      if (visit(node.children)) return true
      ancestors.pop()
    }
    return false
  }
  return visit(items) ? ancestors : []
}

export function getDocumentStats(markdown: string): DocumentStats {
  const withoutMarkup = markdown
    .replace(/^---[\s\S]*?^---\s*$/m, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|\-[\]{}()]/g, ' ')
  const words = withoutMarkup.trim() ? withoutMarkup.trim().split(/\s+/u).length : 0
  const characters = markdown.length
  return {
    words,
    characters,
    charactersNoSpaces: markdown.replace(/\s/g, '').length,
    lines: markdown.length === 0 ? 1 : markdown.split(/\r?\n/).length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 220))
  }
}

export function documentTitle(markdown: string, fallback = 'Untitled'): string {
  const firstHeading = extractOutline(markdown).find((item) => item.level === 1)
  return firstHeading?.text || fallback
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function protectMath(markdown: string) {
  const blocks: string[] = []
  const inline: string[] = []
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let inFence = false
  let fence = ''
  let collectingMath = false
  let mathLines: string[] = []

  const replaceInline = (line: string) => line.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_full, prefix: string, formula: string) => {
    const index = inline.push(formula) - 1
    return `${prefix}TYPEOPENINLINE${index}TOKEN`
  })

  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch && !collectingMath) {
      const char = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fence = char
      } else if (char === fence) {
        inFence = false
        fence = ''
      }
      output.push(line)
      continue
    }

    if (!inFence && /^\s*\$\$\s*$/.test(line)) {
      if (!collectingMath) {
        collectingMath = true
        mathLines = []
      } else {
        const index = blocks.push(mathLines.join('\n')) - 1
        output.push(`TYPEOPENBLOCK${index}TOKEN`)
        collectingMath = false
        mathLines = []
      }
      continue
    }

    if (collectingMath) {
      mathLines.push(line)
    } else if (inFence) {
      output.push(line)
    } else {
      output.push(replaceInline(line))
    }
  }

  if (collectingMath) {
    output.push('$$', ...mathLines)
  }

  return { markdown: output.join('\n'), blocks, inline }
}

function applyMath(html: string, blocks: string[], inline: string[]) {
  let result = html
  blocks.forEach((formula, index) => {
    let rendered: string
    try {
      rendered = katex.renderToString(formula, { displayMode: true, throwOnError: false, output: 'mathml' })
    } catch {
      rendered = `<pre>${escapeAttribute(formula)}</pre>`
    }
    result = result
      .replace(`<p>TYPEOPENBLOCK${index}TOKEN</p>`, `<div class="typeopen-math-block">${rendered}</div>`)
      .replace(`TYPEOPENBLOCK${index}TOKEN`, `<div class="typeopen-math-block">${rendered}</div>`)
  })
  inline.forEach((formula, index) => {
    let rendered: string
    try {
      rendered = katex.renderToString(formula, { displayMode: false, throwOnError: false, output: 'mathml' })
    } catch {
      rendered = `<code>${escapeAttribute(formula)}</code>`
    }
    result = result.replaceAll(`TYPEOPENINLINE${index}TOKEN`, `<span class="typeopen-math-inline">${rendered}</span>`)
  })
  return result
}

function normalizeSequence(code: string): string {
  if (/^\s*sequenceDiagram\b/m.test(code)) return code
  const lines = code.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const converted = lines.map((line) => {
    const note = /^Note\s+(right of|left of|over)\s+([^:]+):\s*(.+)$/i.exec(line)
    if (note) return `Note ${note[1]} ${note[2]}: ${note[3]}`
    const match = /^([^\-:]+?)\s*(-{1,2}>>?|--?>?)\s*([^:]+?):\s*(.+)$/.exec(line)
    if (!match) return line
    const arrow = match[2].includes('--') ? '-->>' : '->>'
    return `${match[1].trim()}${arrow}${match[3].trim()}: ${match[4]}`
  })
  return `sequenceDiagram\n${converted.map((line) => `  ${line}`).join('\n')}`
}

function renderFlowchart(code: string): string {
  const target = document.createElement('div')
  const id = `typeopen-export-flow-${Math.random().toString(36).slice(2)}`
  target.id = id
  target.style.position = 'fixed'
  target.style.left = '-100000px'
  target.style.top = '-100000px'
  target.style.pointerEvents = 'none'
  document.body.appendChild(target)
  try {
    const chart = flowchart.parse(code)
    chart.drawSVG(id, {
      'line-width': 2,
      'font-size': 14,
      'font-family': '-apple-system, BlinkMacSystemFont, sans-serif'
    })
    return target.innerHTML
  } finally {
    target.remove()
  }
}

function outlineHtml(items: OutlineItem[]) {
  if (!items.length) return ''
  return `<nav class="typeopen-export-outline"><strong>Outline</strong><ul>${items
    .map((item) => `<li class="level-${item.level}"><a href="#${item.slug}">${escapeAttribute(item.text)}</a></li>`)
    .join('')}</ul></nav>`
}

export async function createExportHtml(markdown: string, options: ExportOptions = {}): Promise<string> {
  const protectedMath = protectMath(markdown)
  let body = await marked.parse(protectedMath.markdown, { gfm: true, breaks: false })
  body = applyMath(body, protectedMath.blocks, protectedMath.inline)

  const doc = new DOMParser().parseFromString(`<main>${body}</main>`, 'text/html')
  const headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'))
  const outline = extractOutline(markdown)
  headings.forEach((heading, index) => {
    if (outline[index]) heading.id = outline[index].slug
  })

  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: options.theme === 'dark' ? 'dark' : 'default' })
  const diagramNodes = Array.from(doc.querySelectorAll('pre > code.language-mermaid, pre > code.language-sequence, pre > code.language-flow, pre > code.language-flowchart'))
  for (let index = 0; index < diagramNodes.length; index += 1) {
    const code = diagramNodes[index]
    try {
      const language = Array.from(code.classList).find((name) => name.startsWith('language-'))?.slice('language-'.length) || 'mermaid'
      const source = code.textContent || ''
      let svg: string
      if (language === 'flow' || language === 'flowchart') {
        svg = renderFlowchart(source)
      } else {
        const rendered = await mermaid.render(
          `typeopen-export-diagram-${Date.now()}-${index}`,
          language === 'sequence' ? normalizeSequence(source) : source
        )
        svg = rendered.svg
      }
      const wrapper = doc.createElement('div')
      wrapper.className = 'typeopen-diagram'
      wrapper.innerHTML = svg
      code.parentElement?.replaceWith(wrapper)
    } catch {
      // Keep the original fenced code when the diagram cannot be rendered.
    }
  }

  const cleanBody = DOMPurify.sanitize(doc.body.innerHTML, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_ATTR: ['target']
  })
  const title = escapeAttribute(options.title || documentTitle(markdown))
  const maxWidth = Math.max(560, Math.min(1200, options.maxWidth || 860))
  const dark = options.theme === 'dark'
  const outlineMarkup = options.includeOutline ? outlineHtml(outline) : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{color-scheme:${dark ? 'dark' : 'light'};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:${dark ? '#171717' : '#fff'};color:${dark ? '#e9e9e9' : '#242424'}}
body{margin:0;padding:48px 28px;line-height:1.65}.typeopen-export-layout{max-width:${maxWidth + (options.includeOutline ? 260 : 0)}px;margin:0 auto;display:flex;gap:44px;align-items:flex-start}main{max-width:${maxWidth}px;min-width:0;flex:1}h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.5em 0 .6em}h1{font-size:2.1rem;border-bottom:1px solid ${dark ? '#333' : '#e4e4e4'};padding-bottom:.35em}h2{font-size:1.55rem}h3{font-size:1.28rem}a{color:${dark ? '#7bb7ff' : '#1769aa'}}blockquote{margin:1.2em 0;padding:.2em 1em;border-left:3px solid ${dark ? '#555' : '#ccc'};color:${dark ? '#bbb' : '#5c5c5c'}}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:${dark ? '#262626' : '#f4f4f4'};padding:.15em .35em;border-radius:4px}pre{overflow:auto;background:${dark ? '#111' : '#f6f7f8'};padding:16px;border-radius:7px}pre code{background:none;padding:0}table{border-collapse:collapse;width:100%;margin:1.3em 0}th,td{border:1px solid ${dark ? '#444' : '#d8d8d8'};padding:.55em .75em}th{background:${dark ? '#242424' : '#f6f6f6'}}img,svg{max-width:100%;height:auto}.typeopen-math-block{text-align:center;overflow:auto;margin:1.4em 0}.typeopen-diagram{text-align:center;margin:1.5em 0}.typeopen-export-outline{width:220px;position:sticky;top:24px;font-size:.9rem}.typeopen-export-outline ul{list-style:none;padding:0}.typeopen-export-outline li{margin:.35em 0}.typeopen-export-outline .level-2{padding-left:12px}.typeopen-export-outline .level-3,.typeopen-export-outline .level-4,.typeopen-export-outline .level-5,.typeopen-export-outline .level-6{padding-left:24px}.typeopen-export-outline a{text-decoration:none;color:inherit}@media(max-width:900px){.typeopen-export-outline{display:none}.typeopen-export-layout{display:block}}@media print{body{padding:0}.typeopen-export-outline{display:none}}
</style>
</head>
<body><div class="typeopen-export-layout">${outlineMarkup}<main>${cleanBody.replace(/^<main>|<\/main>$/g, '')}</main></div></body>
</html>`
}

export function replaceAllLiteral(markdown: string, query: string, replacement: string, matchCase = false): { value: string; count: number } {
  if (!query) return { value: markdown, count: 0 }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, matchCase ? 'g' : 'gi')
  let count = 0
  const value = markdown.replace(regex, () => {
    count += 1
    return replacement
  })
  return { value, count }
}

export function findMatches(markdown: string, query: string, matchCase = false): number[] {
  if (!query) return []
  const source = matchCase ? markdown : markdown.toLocaleLowerCase()
  const needle = matchCase ? query : query.toLocaleLowerCase()
  const matches: number[] = []
  let offset = 0
  while (offset <= source.length) {
    const index = source.indexOf(needle, offset)
    if (index < 0) break
    matches.push(index)
    offset = index + Math.max(needle.length, 1)
  }
  return matches
}
