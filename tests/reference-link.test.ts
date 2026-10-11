import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { $createParagraphNode, $createTextNode, $getNodeByKey, $getRoot, createEditor } from 'lexical'
import { MarkdownEditor, type MarkdownEditorHandle } from '../src/editor/MarkdownEditor'
import {
  $createReferenceDefinitionNode,
  $createReferenceLinkNode,
  $isReferenceLinkNode,
  ReferenceDefinitionNode,
  ReferenceLinkNode,
  registerReferenceLinkDefinitionSync
} from '../src/editor/referenceLinkPlugin'

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

describe('Markdown reference-style links', () => {
  it.each([
    ['full', '[Example][ref]\n\n[ref]: https://example.com "Title"\n'],
    ['collapsed', '[Example][]\n\n[Example]: https://example.com\n'],
    ['shortcut', '[Example]\n\n[Example]: https://example.com\n']
  ])('renders and round-trips the %s form', async (_kind, source) => {
    const { host, ref } = await mountEditor(source)
    const link = host.querySelector<HTMLAnchorElement>('.typeopen-reference-link')

    expect(link?.textContent).toBe('Example')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(host.querySelector('.typeopen-reference-definition')).not.toBeNull()
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('preserves rich label content and a shared definition', async () => {
    const source = '**[First][shared]** and [Second][shared].\n\n[shared]: /relative "Shared"\n'
    const { host, ref } = await mountEditor(source)
    const links = host.querySelectorAll<HTMLAnchorElement>('.typeopen-reference-link')

    expect(links).toHaveLength(2)
    expect(links[0]?.getAttribute('href')).toBe('/relative')
    expect(links[0]?.getAttribute('title')).toBe('Shared')
    expect(links[0]?.querySelector('strong')?.textContent).toBe('First')
    expect(host.querySelectorAll('.typeopen-reference-definition')).toHaveLength(1)
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical('[**First**][shared] and [Second][shared].\n\n[shared]: /relative "Shared"\n'))
  })

  it('resolves duplicate identifiers from the first definition while preserving every definition', async () => {
    const source = '[Duplicate][dup]\n\n[dup]: https://first.example\n\n[dup]: https://second.example\n\n[unused]: https://unused.example\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector<HTMLAnchorElement>('.typeopen-reference-link')?.getAttribute('href')).toBe('https://first.example')
    expect(host.querySelectorAll('.typeopen-reference-definition')).toHaveLength(3)
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('keeps reference syntax literal in Source Mode', async () => {
    const source = '[Source][ref]\n\n[ref]: https://example.com\n'
    const { host, ref } = await mountEditor(source, true)
    const sourceText = Array.from(host.querySelectorAll('.cm-line')).map((line) => line.textContent ?? '').join('\n')

    expect(sourceText).toContain('[Source][ref]')
    expect(sourceText).toContain('[ref]: https://example.com')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('leaves ordinary inline links on the existing link path', async () => {
    const source = '[Inline](https://example.com).\n'
    const { host, ref } = await mountEditor(source)

    expect(host.querySelector('.typeopen-reference-link')).toBeNull()
    expect(host.querySelector('a')?.textContent).toBe('Inline')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('neutralizes unsafe reference destinations in rich DOM without changing Markdown', async () => {
    const source = '[Unsafe][ref]\n\n[ref]: javascript:evil\n'
    const { host, ref } = await mountEditor(source)
    const link = host.querySelector<HTMLAnchorElement>('.typeopen-reference-link')

    expect(link?.getAttribute('href')).toBe('about:blank')
    expect(canonical(ref.current?.getMarkdown() ?? '')).toBe(canonical(source))
  })

  it('re-resolves cached destinations when rich definitions change or disappear', async () => {
    const editor = createEditor({ nodes: [ReferenceLinkNode, ReferenceDefinitionNode] })
    const unregister = registerReferenceLinkDefinitionSync(editor)
    let linkKey = ''
    let definitionKey = ''

    editor.update(() => {
      const paragraph = $createParagraphNode()
      const link = $createReferenceLinkNode('ref', 'ref', 'full', 'https://stale.example')
      link.append($createTextNode('Reference'))
      paragraph.append(link)
      const definition = $createReferenceDefinitionNode('ref', 'ref', 'https://live.example')
      $getRoot().append(paragraph, definition)
      linkKey = link.getKey()
      definitionKey = definition.getKey()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    editor.getEditorState().read(() => {
      const link = $getNodeByKey(linkKey)
      expect($isReferenceLinkNode(link)).toBe(true)
      if ($isReferenceLinkNode(link)) expect(link.getURL()).toBe('https://live.example')
    })

    editor.update(() => {
      $getNodeByKey(definitionKey)?.remove()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    editor.getEditorState().read(() => {
      const link = $getNodeByKey(linkKey)
      expect($isReferenceLinkNode(link)).toBe(true)
      if ($isReferenceLinkNode(link)) expect(link.getURL()).toBe('')
    })
    unregister()
  })

  it('uses document order rather than node creation order when re-resolving duplicate definitions', async () => {
    const editor = createEditor({ nodes: [ReferenceLinkNode, ReferenceDefinitionNode] })
    const unregister = registerReferenceLinkDefinitionSync(editor)
    let linkKey = ''

    editor.update(() => {
      const second = $createReferenceDefinitionNode('dup', 'dup', 'https://second.example')
      const first = $createReferenceDefinitionNode('dup', 'dup', 'https://first.example')
      const paragraph = $createParagraphNode()
      const link = $createReferenceLinkNode('dup', 'dup', 'full', 'https://stale.example')
      link.append($createTextNode('Duplicate'))
      paragraph.append(link)
      $getRoot().append(paragraph, first, second)
      linkKey = link.getKey()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    editor.getEditorState().read(() => {
      const link = $getNodeByKey(linkKey)
      expect($isReferenceLinkNode(link)).toBe(true)
      if ($isReferenceLinkNode(link)) expect(link.getURL()).toBe('https://first.example')
    })
    unregister()
  })
})
