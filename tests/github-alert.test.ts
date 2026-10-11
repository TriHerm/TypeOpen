import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../src/editor/MarkdownEditor'
import { normalizeGitHubAlertType } from '../src/editor/githubAlertPlugin'

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
    root.render(createElement(MarkdownEditor, { ref, markdown, onChange: () => undefined, sourceMode }))
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

describe('GitHub-style Markdown alerts', () => {
  it('renders and round-trips a canonical alert with rich content and multiple paragraphs', async () => {
    const source = '> [!WARNING]\n> **Important** text.\n>\n> Second paragraph.\n'
    const { host, ref } = await mountEditor(source)
    const alert = host.querySelector<HTMLElement>('.typeopen-github-alert')

    expect(alert?.dataset.alertType).toBe('WARNING')
    expect(alert?.dataset.alertLabel).toBe('Warning')
    expect(alert?.querySelector('strong')?.textContent).toBe('Important')
    expect(alert?.textContent).toContain('Second paragraph.')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('keeps alert Markdown literal in Source Mode', async () => {
    const source = '> [!TIP]\n> Use the literal syntax.\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('> [!TIP]')
    expect(sourceText).toContain('> Use the literal syntax.')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('leaves ordinary blockquotes as ordinary quotes', async () => {
    const source = '> Ordinary quote.\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector('.typeopen-github-alert')).toBeNull()
    expect(host.querySelector('blockquote')?.textContent).toContain('Ordinary quote.')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('normalizes only the five GitHub alert types', () => {
    expect(normalizeGitHubAlertType('tip')).toBe('TIP')
    expect(normalizeGitHubAlertType('IMPORTANT')).toBe('IMPORTANT')
    expect(normalizeGitHubAlertType('danger')).toBe('NOTE')
  })
})
