import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AboutDialog } from '../src/components/AboutDialog'
import { FileEntryDialog } from '../src/components/FileEntryDialog'
import { Sidebar } from '../src/components/Sidebar'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true })
}

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
      outlineDocumentKey: 'doc-1',
      activeOutlineSlug: null,
      fileTree: [],
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onHeadingClick: () => undefined,
      onRequestFocusEditor: () => editor.focus(),
      folderPath: null,
      onCreateEntry: () => undefined,
      onRenameEntry: () => undefined,
      onTrashEntry: () => undefined,
      onRefreshFolder: () => undefined
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

  it('exposes compact file-tree actions and renderer-side sorting without mutating the source tree', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onCreateEntry = vi.fn()
    const onRefreshFolder = vi.fn()
    const fileTree: TypeOpenTreeNode[] = [
      { type: 'file', name: 'z.md', path: '/notes/z.md', modifiedAt: 1, createdAt: 3 },
      { type: 'file', name: 'a.md', path: '/notes/a.md', modifiedAt: 2, createdAt: 1 },
      { type: 'file', name: 'm.md', path: '/notes/m.md', modifiedAt: 3, createdAt: 2 }
    ]

    await act(async () => {
      root.render(createElement(Sidebar, {
        visible: true,
        tab: 'files',
        onTabChange: () => undefined,
        outline: [],
        outlineDocumentKey: 'doc-1',
        activeOutlineSlug: null,
        fileTree,
        currentFilePath: null,
        revealFilePath: null,
        revealRequest: 0,
        onOpenFile: () => undefined,
        onHeadingClick: () => undefined,
        onRequestFocusEditor: () => undefined,
        folderPath: '/notes',
        onCreateEntry,
        onRenameEntry: () => undefined,
        onTrashEntry: () => undefined,
        onRefreshFolder
      }))
    })

    const toolbarButtons = host.querySelectorAll<HTMLButtonElement>('.file-tree-toolbar button')
    await act(async () => toolbarButtons[0].click())
    await act(async () => toolbarButtons[2].click())
    expect(onCreateEntry).toHaveBeenCalledWith('file', '/notes')
    expect(onRefreshFolder).toHaveBeenCalledTimes(1)
    expect(Array.from(host.querySelectorAll('.tree-row.file span:last-child')).map((element) => element.textContent)).toEqual(['a.md', 'm.md', 'z.md'])
    expect(fileTree.map((node) => node.name)).toEqual(['z.md', 'a.md', 'm.md'])

    const sortSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Sort files"]')
    await act(async () => {
      if (!sortSelect) return
      sortSelect.value = 'created-desc'
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(Array.from(host.querySelectorAll('.tree-row.file span:last-child')).map((element) => element.textContent)).toEqual(['z.md', 'm.md', 'a.md'])

    await act(async () => {
      if (!sortSelect) return
      sortSelect.value = 'created-asc'
      sortSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(Array.from(host.querySelectorAll('.tree-row.file span:last-child')).map((element) => element.textContent)).toEqual(['a.md', 'm.md', 'z.md'])

    await act(async () => root.unmount())
  })

  it('keeps image assets out of the editable-document flow and can reveal the selected entry', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onOpenFile = vi.fn()
    const onRevealEntry = vi.fn()
    const fileTree: TypeOpenTreeNode[] = [
      { type: 'file', name: 'note.md', path: '/notes/note.md' },
      { type: 'file', name: 'diagram.svg', path: '/notes/diagram.svg' }
    ]

    await act(async () => {
      root.render(createElement(Sidebar, {
        visible: true,
        tab: 'files',
        onTabChange: () => undefined,
        outline: [],
        outlineDocumentKey: 'doc-1',
        activeOutlineSlug: null,
        fileTree,
        currentFilePath: null,
        revealFilePath: null,
        revealRequest: 0,
        onOpenFile,
        onRevealEntry,
        onHeadingClick: () => undefined,
        onRequestFocusEditor: () => undefined,
        folderPath: '/notes',
        onCreateEntry: () => undefined,
        onRenameEntry: () => undefined,
        onTrashEntry: () => undefined,
        onRefreshFolder: () => undefined
      }))
    })

    await act(async () => host.querySelector<HTMLButtonElement>('.tree-row.file[title="/notes/note.md"]')?.click())
    expect(onOpenFile).toHaveBeenCalledWith('/notes/note.md')

    await act(async () => host.querySelector<HTMLButtonElement>('.tree-row.file[title="/notes/diagram.svg"]')?.click())
    expect(onOpenFile).toHaveBeenCalledTimes(1)

    const revealButton = host.querySelector<HTMLButtonElement>('button[title="Reveal selected in Finder"]')
    expect(revealButton?.disabled).toBe(false)
    await act(async () => revealButton?.click())
    expect(onRevealEntry).toHaveBeenCalledWith(fileTree[1])

    await act(async () => root.unmount())
  })

  it('clears file-tree selection when filtering removes the selected node', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onRevealEntry = vi.fn()
    const onRenameEntry = vi.fn()
    const onTrashEntry = vi.fn()
    const fullTree: TypeOpenTreeNode[] = [
      { type: 'directory', name: 'dist', path: '/notes/dist', children: [{ type: 'file', name: 'generated.md', path: '/notes/dist/generated.md' }] },
      { type: 'file', name: 'note.md', path: '/notes/note.md' }
    ]
    const baseProps = {
      visible: true,
      tab: 'files' as const,
      onTabChange: () => undefined,
      outline: [],
      outlineDocumentKey: 'doc-1',
      activeOutlineSlug: null,
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onRevealEntry,
      onHeadingClick: () => undefined,
      onRequestFocusEditor: () => undefined,
      folderPath: '/notes',
      onCreateEntry: () => undefined,
      onRenameEntry,
      onTrashEntry,
      onRefreshFolder: () => undefined
    }

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, fileTree: fullTree }))
    })
    await act(async () => host.querySelector<HTMLButtonElement>('.tree-node.directory > .tree-row[title="/notes/dist"]')?.click())

    const revealButton = host.querySelector<HTMLButtonElement>('button[title="Reveal selected in Finder"]')
    const renameButton = host.querySelector<HTMLButtonElement>('button[title="Rename selected"]')
    const trashButton = host.querySelector<HTMLButtonElement>('button[title="Move selected to Trash"]')
    expect(revealButton?.disabled).toBe(false)
    expect(renameButton?.disabled).toBe(false)
    expect(trashButton?.disabled).toBe(false)

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, fileTree: [fullTree[1]] }))
    })

    expect(host.querySelector('.tree-node.directory > .tree-row[title="/notes/dist"]')).toBeNull()
    expect(revealButton?.disabled).toBe(true)
    expect(renameButton?.disabled).toBe(true)
    expect(trashButton?.disabled).toBe(true)
    await act(async () => revealButton?.click())
    await act(async () => renameButton?.click())
    await act(async () => trashButton?.click())
    expect(onRevealEntry).not.toHaveBeenCalled()
    expect(onRenameEntry).not.toHaveBeenCalled()
    expect(onTrashEntry).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })

  it('collapses outline branches and reopens the active heading path', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onHeadingClick = vi.fn()
    const outline = [
      { level: 1, text: 'Root', line: 1, slug: 'root' },
      { level: 2, text: 'Child', line: 3, slug: 'child' },
      { level: 3, text: 'Leaf', line: 5, slug: 'leaf' },
      { level: 2, text: 'Sibling', line: 7, slug: 'sibling' }
    ]
    const baseProps = {
      visible: true,
      tab: 'outline' as const,
      onTabChange: () => undefined,
      outline,
      outlineDocumentKey: 'doc-outline',
      fileTree: [],
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onHeadingClick,
      onRequestFocusEditor: () => undefined,
      folderPath: null,
      onCreateEntry: () => undefined,
      onRenameEntry: () => undefined,
      onTrashEntry: () => undefined,
      onRefreshFolder: () => undefined
    }

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, activeOutlineSlug: null }))
    })

    const rootToggle = host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="Collapse Root"]')
    expect(rootToggle?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => rootToggle?.click())
    expect(host.querySelector('.outline-row[title="Line 5"]')).toBeNull()
    expect(host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="Expand Root"]')?.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, activeOutlineSlug: 'leaf' }))
      await Promise.resolve()
    })
    expect(host.querySelector('.outline-row[title="Line 5"]')?.textContent).toBe('Leaf')
    expect(host.querySelector('.outline-row.active')?.textContent).toBe('Leaf')

    const collapseAll = Array.from(host.querySelectorAll<HTMLButtonElement>('.outline-toolbar button')).find((button) => button.textContent === 'Collapse all')
    await act(async () => collapseAll?.click())
    expect(host.querySelector('.outline-row[title="Line 3"]')).toBeNull()

    const expandAll = Array.from(host.querySelectorAll<HTMLButtonElement>('.outline-toolbar button')).find((button) => button.textContent === 'Expand all')
    await act(async () => expandAll?.click())
    expect(host.querySelector('.outline-row[title="Line 5"]')?.textContent).toBe('Leaf')

    await act(async () => root.unmount())
  })

  it('supports flat outline depth filtering and projects a hidden active heading to its visible ancestor', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onHeadingClick = vi.fn()
    const outline = [
      { level: 1, text: 'Root', line: 1, slug: 'root' },
      { level: 2, text: 'Child', line: 3, slug: 'child' },
      { level: 3, text: 'Leaf', line: 5, slug: 'leaf' },
      { level: 2, text: 'Sibling', line: 7, slug: 'sibling' }
    ]
    const baseProps = {
      visible: true,
      tab: 'outline' as const,
      onTabChange: () => undefined,
      outline,
      outlineDocumentKey: 'doc-flat-outline',
      activeOutlineSlug: 'leaf',
      fileTree: [],
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onHeadingClick,
      onRequestFocusEditor: () => undefined,
      folderPath: null,
      onCreateEntry: () => undefined,
      onRenameEntry: () => undefined,
      onTrashEntry: () => undefined,
      onRefreshFolder: () => undefined
    }

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, outlineMode: 'flat', outlineMaxLevel: 2 }))
      await Promise.resolve()
    })

    expect(Array.from(host.querySelectorAll('.outline-row')).map((row) => row.textContent)).toEqual(['Root', 'Child', 'Sibling'])
    expect(host.querySelector('.outline-row[title="Line 5"]')).toBeNull()
    expect(host.querySelector('.outline-row.active')?.textContent).toBe('Child')
    expect(host.querySelector('.outline-toolbar')).toBeNull()
    expect(host.querySelector('.outline-toggle')).toBeNull()

    await act(async () => host.querySelector<HTMLButtonElement>('.outline-row[title="Line 3"]')?.click())
    expect(onHeadingClick).toHaveBeenCalledWith(outline[1])

    await act(async () => {
      root.render(createElement(Sidebar, { ...baseProps, outlineMode: 'hierarchical', outlineMaxLevel: 2 }))
      await Promise.resolve()
    })
    expect(host.querySelector('.outline-toolbar')).not.toBeNull()
    expect(host.querySelector('.outline-row[title="Line 5"]')).toBeNull()
    expect(host.querySelector('.outline-row.active')?.textContent).toBe('Child')

    await act(async () => root.unmount())
  })

  it('preserves hierarchical collapse state while switching through flat outline mode', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const outline = [
      { level: 1, text: 'Root', line: 1, slug: 'root' },
      { level: 2, text: 'Child', line: 3, slug: 'child' },
      { level: 3, text: 'Leaf', line: 5, slug: 'leaf' }
    ]
    const baseProps = {
      visible: true,
      tab: 'outline' as const,
      onTabChange: () => undefined,
      outline,
      outlineDocumentKey: 'doc-preserve-collapse',
      activeOutlineSlug: null,
      outlineMaxLevel: 6 as const,
      fileTree: [],
      currentFilePath: null,
      revealFilePath: null,
      revealRequest: 0,
      onOpenFile: () => undefined,
      onHeadingClick: () => undefined,
      onRequestFocusEditor: () => undefined,
      folderPath: null,
      onCreateEntry: () => undefined,
      onRenameEntry: () => undefined,
      onTrashEntry: () => undefined,
      onRefreshFolder: () => undefined
    }

    await act(async () => root.render(createElement(Sidebar, { ...baseProps, outlineMode: 'hierarchical' })))
    await act(async () => host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="Collapse Root"]')?.click())
    expect(host.querySelector('.outline-row[title="Line 5"]')).toBeNull()

    await act(async () => root.render(createElement(Sidebar, { ...baseProps, outlineMode: 'flat' })))
    expect(host.querySelector('.outline-row[title="Line 5"]')?.textContent).toBe('Leaf')

    await act(async () => root.render(createElement(Sidebar, { ...baseProps, outlineMode: 'hierarchical' })))
    expect(host.querySelector<HTMLButtonElement>('.outline-toggle[aria-label="Expand Root"]')?.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('.outline-row[title="Line 5"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('contains file-entry dialog focus and restores the previous control', async () => {
    const previous = document.createElement('button')
    previous.textContent = 'Previous'
    document.body.append(previous)
    previous.focus()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const onClose = vi.fn()

    await act(async () => {
      root.render(createElement(FileEntryDialog, { visible: true, mode: 'create-file', onClose, onSubmit: () => undefined }))
      await Promise.resolve()
    })
    const input = host.querySelector<HTMLInputElement>('input')
    const controls = Array.from(host.querySelectorAll<HTMLElement>('button, input')).filter((control) => !(control instanceof HTMLButtonElement && control.disabled))
    expect(document.activeElement).toBe(input)

    controls.at(-1)?.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(controls[0])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.render(createElement(FileEntryDialog, { visible: false, mode: 'create-file', onClose, onSubmit: () => undefined }))
      await Promise.resolve()
    })
    await Promise.resolve()
    expect(document.activeElement).toBe(previous)
    await act(async () => root.unmount())
  })
})
