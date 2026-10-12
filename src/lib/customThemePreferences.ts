export type EditorTheme = 'system' | 'light' | 'dark'
export type CustomThemeAppearance = 'light' | 'dark'

export interface CustomThemePreferences {
  customLightThemeName: string | null
  customLightThemeCss: string
  customDarkThemeName: string | null
  customDarkThemeCss: string
}

export interface SystemThemeQuery {
  matches: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

function normalizeName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, 512) : null
}

function normalizeCss(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeCustomThemePreferences(value: unknown): CustomThemePreferences {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const hasNewSchema = [
    'customLightThemeName',
    'customLightThemeCss',
    'customDarkThemeName',
    'customDarkThemeCss'
  ].some((key) => Object.prototype.hasOwnProperty.call(raw, key))

  if (hasNewSchema) {
    return {
      customLightThemeName: normalizeName(raw.customLightThemeName),
      customLightThemeCss: normalizeCss(raw.customLightThemeCss),
      customDarkThemeName: normalizeName(raw.customDarkThemeName),
      customDarkThemeCss: normalizeCss(raw.customDarkThemeCss)
    }
  }

  const legacyName = normalizeName(raw.customThemeName)
  const legacyCss = normalizeCss(raw.customThemeCss)
  return {
    customLightThemeName: legacyName,
    customLightThemeCss: legacyCss,
    customDarkThemeName: legacyName,
    customDarkThemeCss: legacyCss
  }
}

export function resolveCustomTheme(
  preferences: CustomThemePreferences,
  theme: EditorTheme,
  systemPrefersDark: boolean
): { appearance: CustomThemeAppearance; name: string | null; css: string } {
  const appearance: CustomThemeAppearance = theme === 'dark' || (theme === 'system' && systemPrefersDark) ? 'dark' : 'light'
  return appearance === 'dark'
    ? { appearance, name: preferences.customDarkThemeName, css: preferences.customDarkThemeCss }
    : { appearance, name: preferences.customLightThemeName, css: preferences.customLightThemeCss }
}

export function observeSystemTheme(query: SystemThemeQuery | null | undefined, onChange: (prefersDark: boolean) => void): () => void {
  if (!query) return () => undefined
  const update = () => onChange(query.matches)
  update()
  query.addEventListener?.('change', update)
  return () => query.removeEventListener?.('change', update)
}
