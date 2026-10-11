export const EXPORT_FORMATS = ['pdf', 'html', 'html-plain', 'image', 'docx', 'odt', 'rtf', 'epub', 'latex', 'mediawiki'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

type DirectExportResult = { filePath: string } | null
type PandocExportResult = { ok: boolean; filePath?: string; error?: string } | null

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value)
}

export function successfulExportPath(format: ExportFormat, result: DirectExportResult | PandocExportResult): string | null {
  if (!result) return null
  if (format === 'pdf' || format === 'html' || format === 'html-plain' || format === 'image') {
    return typeof result.filePath === 'string' && result.filePath ? result.filePath : null
  }
  return 'ok' in result && result.ok && typeof result.filePath === 'string' && result.filePath ? result.filePath : null
}

export function rememberSuccessfulExport(
  history: Map<string, ExportFormat>,
  documentId: string,
  format: ExportFormat,
  result: DirectExportResult | PandocExportResult
): string | null {
  const filePath = successfulExportPath(format, result)
  if (filePath) history.set(documentId, format)
  return filePath
}
