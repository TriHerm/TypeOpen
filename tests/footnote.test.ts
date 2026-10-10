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

describe('canonical GFM footnotes', () => {
  it('renders paired references and definitions in rich mode and round-trips canonical Markdown', async () => {
    const source = 'A reference[^note].\n\n[^note]: Footnote text.\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector('.typeopen-footnote-reference')?.textContent).toBe('[^note]')
    expect(host.querySelector('.typeopen-footnote-definition')?.getAttribute('data-footnote-label')).toBe('note')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('preserves rich inline content inside a canonical footnote definition', async () => {
    const source = 'A[^details].\n\n[^details]: **Bold** and `code`.\n'
    const { ref } = await mountEditor(source)

    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('keeps canonical paired footnote syntax literal in source mode', async () => {
    const source = 'Source[^id].\n\n[^id]: Literal footnote.\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('Source[^id].')
    expect(sourceText).toContain('[^id]: Literal footnote.')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })
})
