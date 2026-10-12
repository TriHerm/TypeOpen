export type ExportAppearance = 'editor' | 'light' | 'dark'
export type ExportTheme = 'light' | 'dark'

export function normalizeExportAppearance(value: unknown): ExportAppearance {
  return value === 'light' || value === 'dark' || value === 'editor' ? value : 'editor'
}

export function resolveExportTheme(
  appearance: ExportAppearance,
  editorTheme: 'system' | 'light' | 'dark',
  systemPrefersDark: boolean
): ExportTheme {
  if (appearance === 'light' || appearance === 'dark') return appearance
  if (editorTheme === 'light' || editorTheme === 'dark') return editorTheme
  return systemPrefersDark ? 'dark' : 'light'
}
