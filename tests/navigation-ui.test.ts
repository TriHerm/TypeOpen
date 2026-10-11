import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AboutDialog } from '../src/components/AboutDialog'
import { Sidebar } from '../src/components/Sidebar'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

describe('navigation accessibility', () => {
  it('contains About focus and restores the previous control', async () => {
    const previous = document.createElement('button')
    previous.textContent = 'Previous'
    document.body.append(previous)
    previous.focus()

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onClose = vi.fn()

    await act(async () => {
      root.render(createElement(AboutDialog, {
        visible: true,
        version: '0.1.5',
        onClose,
        onOpenProject: () => undefined,
        onOpenLabs: () => undefined
      }))
    })

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    expect(document.activeElement).toBe(buttons[0])

    buttons.at(-1)?.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(buttons[0])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(createElement(AboutDialog, {
        visible: false,
        version: '0.1.5',
        onClose,
        onOpenProject: () => undefined,
        onOpenLabs: () => undefined
      }))
      await Promise.resolve()
    })
    await Promise.resolve()
    expect(document.activeElement).toBe(previous)

    await act(async () => root.unmount())
  })

  it('removes a collapsed sidebar from interaction and hands focus to the editor', async () => {
    const editor = document.createElement('button')
    editor.textContent = 'Editor'
    document.body.append(editor)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    const props = {
      tab: 'outline' as const,
      onTabChange: () => undefined,
      outline: [],
      activeOutlineSlug: null,
      fileTree: [],
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onHeadingClick: () => undefined,
      onRequestFocusEditor: () => editor.focus()
    }

    await act(async () => {
      root.render(createElement(Sidebar, { ...props, visible: true }))
    })
    const sidebarButton = host.querySelector<HTMLButtonElement>('.sidebar-tabs button')
    sidebarButton?.focus()
    expect(document.activeElement).toBe(sidebarButton)

    await act(async () => {
      root.render(createElement(Sidebar, { ...props, visible: false }))
    })

    const sidebar = host.querySelector<HTMLElement>('.sidebar')
    expect(sidebar?.hasAttribute('inert')).toBe(true)
    expect(sidebar?.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(editor)

    await act(async () => root.unmount())
  })
})
