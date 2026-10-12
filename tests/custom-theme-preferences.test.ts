import { describe, expect, it } from 'vitest'
import { normalizeCustomThemePreferences, observeSystemTheme, resolveCustomTheme, type SystemThemeQuery } from '../src/lib/customThemePreferences'

describe('custom theme preferences', () => {
  it('migrates one legacy custom theme to both Light and Dark slots', () => {
    expect(normalizeCustomThemePreferences({ customThemeName: 'legacy.css', customThemeCss: ':root{--x:1}' })).toEqual({
      customLightThemeName: 'legacy.css',
      customLightThemeCss: ':root{--x:1}',
      customDarkThemeName: 'legacy.css',
      customDarkThemeCss: ':root{--x:1}'
    })
  })

  it('treats the new schema as authoritative instead of falling back to legacy values', () => {
    expect(normalizeCustomThemePreferences({
      customThemeName: 'legacy.css',
      customThemeCss: 'legacy',
      customLightThemeName: 'light.css',
      customLightThemeCss: 'light'
    })).toEqual({
      customLightThemeName: 'light.css',
      customLightThemeCss: 'light',
      customDarkThemeName: null,
      customDarkThemeCss: ''
    })
  })

  const slots = {
    customLightThemeName: 'light.css',
    customLightThemeCss: 'light',
    customDarkThemeName: 'dark.css',
    customDarkThemeCss: 'dark'
  }

  it('resolves explicit editor themes independently of system appearance', () => {
    expect(resolveCustomTheme(slots, 'light', true)).toEqual({ appearance: 'light', name: 'light.css', css: 'light' })
    expect(resolveCustomTheme(slots, 'dark', false)).toEqual({ appearance: 'dark', name: 'dark.css', css: 'dark' })
  })

  it('switches the effective slot with system appearance', () => {
    expect(resolveCustomTheme(slots, 'system', false).css).toBe('light')
    expect(resolveCustomTheme(slots, 'system', true).css).toBe('dark')
  })

  it('observes live system appearance changes and removes the listener on cleanup', () => {
    const holder: { listener?: () => void } = {}
    const query: SystemThemeQuery = {
      matches: false,
      addEventListener: (_type, next) => { holder.listener = next },
      removeEventListener: (_type, next) => { if (holder.listener === next) delete holder.listener }
    }
    const values: boolean[] = []
    const cleanup = observeSystemTheme(query, (value) => values.push(value))
    expect(values).toEqual([false])

    query.matches = true
    holder.listener?.()
    expect(values).toEqual([false, true])

    cleanup()
    expect(holder.listener).toBeUndefined()
  })
})
