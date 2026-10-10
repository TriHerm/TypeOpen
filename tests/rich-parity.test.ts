import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../src/editor/MarkdownEditor'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; host: HTMLDivElement }> = []

function canonical(markdown: string) {
  return markdown.replace(/\n+$/, '')
}

async function mountEditor(markdown: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const ref = createRef<MarkdownEditorHandle>()
  mounted.push({ root, host })

  await act(async () => {
    root.render(createElement(MarkdownEditor, {
      ref,
      markdown,
      onChange: () => undefined
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
})
