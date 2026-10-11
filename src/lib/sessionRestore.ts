export interface SessionIntentEntry {
  id: string
  filePath: string
  dirty: boolean
}

export interface SessionIntent {
  version: 1
  documents: SessionIntentEntry[]
  activeDocumentId: string
}

export function buildSessionIntent<T extends { id: string; filePath: string | null }>(
  documents: T[],
  activeDocumentId: string,
  isDirty: (document: T) => boolean
): SessionIntent {
  return {
    version: 1,
    documents: documents.flatMap((document) => document.filePath ? [{
      id: document.id,
      filePath: document.filePath,
      dirty: isDirty(document)
    }] : []),
    activeDocumentId
  }
}
