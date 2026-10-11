const fs = require('node:fs')
const path = require('node:path')

function normalizePath(value) {
  if (typeof value !== 'string' || !value) return null
  return path.resolve(value)
}

function isInsideOrEqual(targetPath, folderPath) {
  const target = normalizePath(targetPath)
  const folder = normalizePath(folderPath)
  if (!target || !folder) return false
  const relative = path.relative(folder, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function realPath(value) {
  const normalized = normalizePath(value)
  if (!normalized) return null
  try {
    return fs.realpathSync.native(normalized)
  } catch {
    return null
  }
}

function pathSnapshot(value, { rejectSymbolicLink = false } = {}) {
  const normalized = normalizePath(value)
  if (!normalized) return null
  try {
    const link = fs.lstatSync(normalized)
    if (rejectSymbolicLink && link.isSymbolicLink()) return null
    const stat = fs.statSync(normalized)
    return {
      realPath: fs.realpathSync.native(normalized),
      device: stat.dev,
      inode: stat.ino,
      fileType: stat.mode & fs.constants.S_IFMT,
      size: stat.size,
      mtimeMs: stat.mtimeMs
    }
  } catch {
    return null
  }
}

function samePathSnapshot(left, right) {
  return Boolean(left && right &&
    left.realPath === right.realPath &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.fileType === right.fileType &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs)
}

function createPathGrants() {
  const documents = new Map()
  let folder = null

  const activeFolder = () => {
    if (!folder) return null
    return realPath(folder.path) === folder.realPath ? folder : null
  }

  return {
    grantDocument(filePath, expectedSnapshot = null) {
      const normalized = normalizePath(filePath)
      if (!normalized) throw new Error('A valid document path is required.')
      const snapshot = pathSnapshot(normalized, { rejectSymbolicLink: true })
      if (!snapshot) throw new Error('The granted document path must be a safe local file or package.')
      if (expectedSnapshot && !samePathSnapshot(snapshot, expectedSnapshot)) throw new Error('Document path changed while it was being authorized.')
      documents.set(normalized, snapshot)
      return normalized
    },
    revokeDocument(filePath) {
      const normalized = normalizePath(filePath)
      if (normalized) documents.delete(normalized)
    },
    setFolder(folderPath) {
      const normalized = normalizePath(folderPath)
      if (!normalized) throw new Error('A valid folder path is required.')
      const grantedRealPath = realPath(normalized)
      if (!grantedRealPath) throw new Error('The granted folder path must exist.')
      folder = { path: normalized, realPath: grantedRealPath }
      return normalized
    },
    clearFolder() {
      folder = null
    },
    getFolder() {
      return activeFolder()?.path || null
    },
    getFolderRealPath() {
      return activeFolder()?.realPath || null
    },
    isDocumentGranted(filePath) {
      const normalized = normalizePath(filePath)
      if (!normalized) return false
      const granted = documents.get(normalized)
      const current = pathSnapshot(normalized, { rejectSymbolicLink: true })
      return Boolean(granted && current &&
        granted.realPath === current.realPath &&
        granted.device === current.device &&
        granted.inode === current.inode &&
        granted.fileType === current.fileType)
    },
    canReadDocument(filePath) {
      const normalized = normalizePath(filePath)
      if (!normalized) return false
      if (this.isDocumentGranted(normalized)) return true
      const grantedFolder = activeFolder()
      const targetRealPath = realPath(normalized)
      return Boolean(grantedFolder && targetRealPath && isInsideOrEqual(targetRealPath, grantedFolder.realPath))
    },
    canWriteDocument(filePath) {
      return this.isDocumentGranted(filePath)
    },
    canListFolder(folderPath) {
      const grantedFolder = activeFolder()
      const targetRealPath = realPath(folderPath)
      return Boolean(grantedFolder && targetRealPath && isInsideOrEqual(targetRealPath, grantedFolder.realPath))
    },
    isCurrentFolder(folderPath) {
      const normalized = normalizePath(folderPath)
      const grantedFolder = activeFolder()
      return Boolean(normalized && grantedFolder && grantedFolder.path === normalized)
    }
  }
}

module.exports = { createPathGrants, isInsideOrEqual, normalizePath, pathSnapshot, realPath, samePathSnapshot }
