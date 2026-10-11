import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../src/editor/MarkdownEditor'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; host: HTMLDivElement }> = []

function canonical(markdown: string) {
  return markdown.replace(/\n+$/, '')
}

async function mountEditor(markdown: string, sourceMode = false) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const ref = createRef<MarkdownEditorHandle>()
  mounted.push({ root, host })

  await act(async () => {
    root.render(createElement(MarkdownEditor, {
      ref,
      markdown,
      onChange: () => undefined,
      sourceMode
    }))
    await Promise.resolve()
  })

  return { host, ref }
}

afterEach(async () => {
  await act(async () => {
    for (const { root } of mounted.splice(0)) root.unmount()
  })
  document.body.innerHTML = ''
})

describe('rich-mode parity extensions', () => {
  it('renders a standalone TOC marker and serializes it back exactly', async () => {
    const source = '# First\n\n[TOC]\n\n## Second\n'
    const { host, ref } = await mountEditor(source)

    const toc = host.querySelector('.typeopen-live-toc')
    expect(toc).not.toBeNull()
    expect(toc?.textContent).toContain('First')
    expect(toc?.textContent).toContain('Second')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('round-trips highlight, superscript and subscript markup in rich mode', async () => {
    const source = '==highlight== <sup>up</sup> <sub>down</sub>\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector('mark')?.textContent).toBe('highlight')
    expect(host.querySelector('sup')?.textContent).toBe('up')
    expect(host.querySelector('sub')?.textContent).toBe('down')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('preserves inline and block HTML comments in rich mode', async () => {
    const source = 'Before <!-- keep inline --> after\n\n<!-- keep block\nacross lines -->\n\nAfter\n'
    const { host, ref } = await mountEditor(source)

    const comments = host.querySelectorAll('.typeopen-html-comment')
    expect(comments).toHaveLength(2)
    expect(comments[0].textContent).toContain('keep inline')
    expect(comments[1].textContent).toContain('keep block')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('keeps normal HTML processing while preserving comments', async () => {
    const source = '<div class="note">Nested **markdown**</div>\n\nBefore <!-- keep --> after\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector('div.note')?.textContent).toContain('Nested')
    expect(host.querySelector('.typeopen-html-comment')?.textContent).toContain('keep')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('does not reinterpret user-authored data-typeopen-comment HTML', async () => {
    const source = '<span data-typeopen-comment="hello"></span>\n\nBefore <!-- keep --> after\n'
    const { host, ref } = await mountEditor(source)
    const roundTripped = ref.current?.getMarkdown() ?? ''

    expect(host.querySelector('span[data-typeopen-comment="hello"]')).not.toBeNull()
    expect(host.querySelector('.typeopen-html-comment')?.textContent).toContain('keep')
    expect(roundTripped).toContain('data-typeopen-comment="hello"')
    expect(roundTripped).toContain('<!-- keep -->')
  })

  it('keeps HTML comments literal in source mode', async () => {
    const source = 'Before <!-- literal --> after\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('<!-- literal -->')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('keeps highlight and strikethrough markers literal in source mode', async () => {
    const source = '==highlight== and ~~strike~~\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('==highlight== and ~~strike~~')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })
})
