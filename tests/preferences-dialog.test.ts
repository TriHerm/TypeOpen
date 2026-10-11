import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesDialog, type TypeOpenPreferences } from '../src/components/PreferencesDialog'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const preferences: TypeOpenPreferences = {
  theme: 'system',
  customThemeName: null,
  customThemeCss: '',
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
  showHiddenFiles: false
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
})
