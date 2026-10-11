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

describe('Markdown hard breaks', () => {
  it('preserves a backslash hard break through rich mode', async () => {
    const { host, ref } = await mountEditor('alpha\\\nbeta\n')

    expect(host.querySelector('br')).not.toBeNull()
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe('alpha\\\nbeta')
  })

  it('preserves two-space hard-break semantics while canonicalizing the marker', async () => {
    const { host, ref } = await mountEditor('alpha  \nbeta\n')

    expect(host.querySelector('br')).not.toBeNull()
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe('alpha\\\nbeta')
  })

  it('does not promote an ordinary soft source newline into a hard break', async () => {
    const { host, ref } = await mountEditor('alpha\nbeta\n')

    expect(host.querySelector('br')).toBeNull()
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe('alpha\nbeta')
  })

  it('preserves a hard break inside a list item paragraph', async () => {
    const { host, ref } = await mountEditor('- one\\\n  two\n')

    expect(host.querySelector('li br')).not.toBeNull()
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe('* one\\\n  two')
  })

  it('keeps hard-break semantics literal in Source Mode using the canonical backslash marker', async () => {
    const source = 'alpha  \nbeta\\\ngamma\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('alpha\\')
    expect(sourceText).toContain('beta\\')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe('alpha\\\nbeta\\\ngamma')
  })
})
