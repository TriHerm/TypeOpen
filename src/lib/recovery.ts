export const RECOVERY_VERSION = 1
export const MAX_RECOVERY_DOCUMENTS = 20

export interface RecoveryDocumentSnapshot {
  id: string
  markdown: string
  sourcePath?: string
  suggestedName?: string
}

export interface RecoverySnapshot {
  version: 1
  documents: RecoveryDocumentSnapshot[]
  activeDocumentId?: string
}

export interface RecoveryCandidate extends RecoveryDocumentSnapshot {
  dirty: boolean
}

export function buildRecoverySnapshot(candidates: RecoveryCandidate[], activeDocumentId: string): RecoverySnapshot {
  const documents = candidates.filter((candidate) => candidate.dirty).slice(0, MAX_RECOVERY_DOCUMENTS).map(({ dirty: _dirty, ...document }) => document)
  return {
    version: RECOVERY_VERSION,
    documents,
    ...(documents.some((document) => document.id === activeDocumentId) ? { activeDocumentId } : {})
  }
}

export function parseRecoverySnapshot(value: unknown): RecoverySnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RecoverySnapshot>
  if (candidate.version !== RECOVERY_VERSION || !Array.isArray(candidate.documents) || candidate.documents.length > MAX_RECOVERY_DOCUMENTS) return null
  const documents: RecoveryDocumentSnapshot[] = []
  for (const document of candidate.documents) {
    if (!document || typeof document.id !== 'string' || !document.id || typeof document.markdown !== 'string') return null
    documents.push({
      id: document.id,
      markdown: document.markdown,
      ...(typeof document.sourcePath === 'string' && document.sourcePath ? { sourcePath: document.sourcePath } : {}),
      ...(typeof document.suggestedName === 'string' && document.suggestedName ? { suggestedName: document.suggestedName } : {})
    })
  }
  const activeDocumentId = typeof candidate.activeDocumentId === 'string' && documents.some((document) => document.id === candidate.activeDocumentId)
    ? candidate.activeDocumentId
    : undefined
  return { version: RECOVERY_VERSION, documents, ...(activeDocumentId ? { activeDocumentId } : {}) }
}
