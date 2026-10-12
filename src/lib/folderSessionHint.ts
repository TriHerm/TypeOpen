export const FOLDER_SESSION_HINT_KEY = 'typeopen.folder-session-hint.v1'
export const MAX_FOLDER_SESSION_HINT_LENGTH = 4096

export function normalizeFolderSessionHint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FOLDER_SESSION_HINT_LENGTH || value.includes('\0')) return null
  return value
}

export function loadFolderSessionHint(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    return normalizeFolderSessionHint(storage.getItem(FOLDER_SESSION_HINT_KEY))
  } catch {
    return null
  }
}

export function saveFolderSessionHint(storage: Pick<Storage, 'setItem'>, folderPath: string): boolean {
  const normalized = normalizeFolderSessionHint(folderPath)
  if (!normalized) return false
  try {
    storage.setItem(FOLDER_SESSION_HINT_KEY, normalized)
    return true
  } catch {
    return false
  }
}
