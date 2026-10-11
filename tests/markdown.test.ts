import { describe, expect, it } from 'vitest'
import { buildOutlineTree, createExportHtml, documentTitle, extractOutline, findMatches, getDocumentStats, outlineAncestorSlugs, replaceAllLiteral, slugifyHeading } from '../src/lib/markdown'

describe('markdown document helpers', () => {
  it('extracts headings while ignoring fenced code', () => {
    const markdown = `# Project\n\n## One\n\n\`\`\`md\n# Not a heading\n\`\`\`\n\n### One A\n\n## One`
    expect(extractOutline(markdown)).toEqual([
      { level: 1, text: 'Project', line: 1, slug: 'project' },
      { level: 2, text: 'One', line: 3, slug: 'one' },
      { level: 3, text: 'One A', line: 9, slug: 'one-a' },
      { level: 2, text: 'One', line: 11, slug: 'one-2' }
    ])
  })

  it('creates stable unicode-friendly slugs and document titles', () => {
    expect(slugifyHeading('Café & Sistemas: 2026')).toBe('café-sistemas-2026')
    expect(documentTitle('Text before\n\n# Primary title')).toBe('Primary title')
    expect(documentTitle('No heading', 'Draft')).toBe('Draft')
  })

  it('builds a hierarchical outline using the nearest previous lower-level heading', () => {
    const items = extractOutline('# Root\n\n### Deep\n\n#### Leaf\n\n## Sibling\n\n# Next')
    const tree = buildOutlineTree(items)
    expect(tree.map((item) => item.slug)).toEqual(['root', 'next'])
    expect(tree[0].children.map((item) => item.slug)).toEqual(['deep', 'sibling'])
    expect(tree[0].children[0].children.map((item) => item.slug)).toEqual(['leaf'])
    expect(outlineAncestorSlugs(tree, 'leaf')).toEqual(['root', 'deep'])
    expect(outlineAncestorSlugs(tree, 'next')).toEqual([])
  })

  it('calculates practical document statistics', () => {
    const stats = getDocumentStats('# Title\n\nHello **world**. [Link](https://example.com)')
    expect(stats.words).toBeGreaterThanOrEqual(4)
    expect(stats.characters).toBeGreaterThan(stats.charactersNoSpaces)
    expect(stats.lines).toBe(3)
    expect(stats.readingMinutes).toBe(1)
  })

  it('finds literal matches with case sensitivity controls', () => {
    expect(findMatches('One one ONE', 'one')).toEqual([0, 4, 8])
    expect(findMatches('One one ONE', 'one', true)).toEqual([4])
    expect(findMatches('a.b a.b', 'a.b')).toEqual([0, 4])
  })

  it('replaces literal text rather than interpreting regex syntax', () => {
    expect(replaceAllLiteral('a.b aXb a.b', 'a.b', 'x')).toEqual({ value: 'x aXb x', count: 2 })
    expect(replaceAllLiteral('A a', 'a', 'z', true)).toEqual({ value: 'A z', count: 1 })
  })

  it('exports self-contained MathML without relying on KaTeX CSS', async () => {
    const html = await createExportHtml('# Math\n\nInline $x^2$ and:\n\n$$\ny = mx + b\n$$')
    expect(html).toContain('<math')
    expect(html).not.toContain('katex-html')
    expect(html).toContain('id="math"')
  })

  it('leaves page geometry to Electron Page Setup instead of emitting a conflicting @page rule', async () => {
    const html = await createExportHtml('# Print')
    expect(html).not.toContain('@page')
  })
})
