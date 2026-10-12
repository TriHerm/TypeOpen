import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesDialog, type TypeOpenPreferences } from '../src/components/PreferencesDialog'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const preferences: TypeOpenPreferences = {
  theme: 'system',
  customLightThemeName: null,
  customLightThemeCss: '',
  customDarkThemeName: null,
  customDarkThemeCss: '',
  exportAppearance: 'editor',
  fontSize: 17,
  contentWidth: 780,
  spellCheck: true,
  autosave: false,
  autoPairBrackets: true,
  defaultCodeLanguage: 'text',
  outlineMode: 'hierarchical',
  outlineMaxLevel: 6,
  statusBar: true,
  toolbar: false,
  sidebarDefault: true,
  showHiddenFiles: false,
  fileTreeExcludeGlobs: ''
}

describe('Preferences dialog', () => {
  it('exposes hidden-file visibility as a persisted Files preference', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onChange = vi.fn()

    await act(async () => {
      root.render(createElement(PreferencesDialog, {
        visible: true,
        preferences,
        onChange,
        onClose: () => undefined,
        onChooseCustomTheme: () => undefined
      }))
    })

    const filesTab = Array.from(host.querySelectorAll<HTMLButtonElement>('.preferences-body nav button'))
      .find((button) => button.textContent === 'Files')
    if (!filesTab) throw new Error('Files preferences tab not found')
    await act(async () => filesTab.click())

    const hiddenToggle = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .find((input) => input.parentElement?.textContent?.includes('Show hidden files'))
    if (!hiddenToggle) throw new Error('Hidden-file preference not found')
    await act(async () => hiddenToggle.click())

    expect(onChange).toHaveBeenCalledWith({ ...preferences, showHiddenFiles: true })
    await act(async () => root.unmount())
    host.remove()
  })

  it('exposes file-library exclusion globs without changing host authority', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onChange = vi.fn()

    await act(async () => {
      root.render(createElement(PreferencesDialog, {
        visible: true,
        preferences,
        onChange,
        onClose: () => undefined,
        onChooseCustomTheme: () => undefined
      }))
    })

    const filesTab = Array.from(host.querySelectorAll<HTMLButtonElement>('.preferences-body nav button'))
      .find((button) => button.textContent === 'Files')
    if (!filesTab) throw new Error('Files preferences tab not found')
    await act(async () => filesTab.click())

    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')
    if (!textarea) throw new Error('Library exclusions textarea not found')
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      valueSetter?.call(textarea, 'dist/**\n*.tmp')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({ ...preferences, fileTreeExcludeGlobs: 'dist/**\n*.tmp' })
    await act(async () => root.unmount())
    host.remove()
  })

  it('exposes a built-in export appearance preference', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onChange = vi.fn()

    await act(async () => {
      root.render(createElement(PreferencesDialog, {
        visible: true,
        preferences,
        onChange,
        onClose: () => undefined,
        onChooseCustomTheme: () => undefined
      }))
    })

    const appearanceTab = Array.from(host.querySelectorAll<HTMLButtonElement>('.preferences-body nav button'))
      .find((button) => button.textContent === 'Appearance')
    if (!appearanceTab) throw new Error('Appearance preferences tab not found')
    await act(async () => appearanceTab.click())

    const select = Array.from(host.querySelectorAll<HTMLSelectElement>('select'))
      .find((candidate) => candidate.parentElement?.textContent?.includes('Export appearance'))
    if (!select) throw new Error('Export appearance selector not found')
    await act(async () => {
      select.value = 'dark'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({ ...preferences, exportAppearance: 'dark' })
    await act(async () => root.unmount())
    host.remove()
  })

  it('chooses and removes custom Light/Dark themes independently', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onChange = vi.fn()
    const onChooseCustomTheme = vi.fn()
    const configured: TypeOpenPreferences = {
      ...preferences,
      customLightThemeName: 'paper.css',
      customLightThemeCss: ':root{--bg:#fff}',
      customDarkThemeName: 'ink.css',
      customDarkThemeCss: ':root{--bg:#111}'
    }

    await act(async () => {
      root.render(createElement(PreferencesDialog, {
        visible: true,
        preferences: configured,
        onChange,
        onClose: () => undefined,
        onChooseCustomTheme
      }))
    })
    const appearanceTab = Array.from(host.querySelectorAll<HTMLButtonElement>('.preferences-body nav button'))
      .find((button) => button.textContent === 'Appearance')
    if (!appearanceTab) throw new Error('Appearance preferences tab not found')
    await act(async () => appearanceTab.click())

    const rows = Array.from(host.querySelectorAll<HTMLElement>('.custom-theme-row'))
    const lightRow = rows.find((row) => row.textContent?.includes('Light custom theme'))
    const darkRow = rows.find((row) => row.textContent?.includes('Dark custom theme'))
    if (!lightRow || !darkRow) throw new Error('Custom theme rows not found')
    const lightButtons = lightRow.querySelectorAll<HTMLButtonElement>('button')
    const darkButtons = darkRow.querySelectorAll<HTMLButtonElement>('button')
    await act(async () => lightButtons[0].click())
    await act(async () => darkButtons[0].click())
    expect(onChooseCustomTheme).toHaveBeenNthCalledWith(1, 'light')
    expect(onChooseCustomTheme).toHaveBeenNthCalledWith(2, 'dark')

    await act(async () => lightButtons[1].click())
    expect(onChange).toHaveBeenCalledWith({ ...configured, customLightThemeName: null, customLightThemeCss: '' })
    await act(async () => darkButtons[1].click())
    expect(onChange).toHaveBeenCalledWith({ ...configured, customDarkThemeName: null, customDarkThemeCss: '' })

    await act(async () => root.unmount())
    host.remove()
  })
})
