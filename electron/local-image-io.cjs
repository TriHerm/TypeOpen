const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { isInsideOrEqual, pathSnapshot, samePathIdentity } = require('./path-grants.cjs')

const DEFAULT_MAX_IMAGE_BYTES = 64 * 1024 * 1024

function openedFileIdentity(stat) {
  return {
    device: stat.dev,
    inode: stat.ino,
    fileType: stat.mode & fs.constants.S_IFMT
  }
}

function sameOpenedIdentity(stat, snapshot) {
  const opened = openedFileIdentity(stat)
  return Boolean(snapshot &&
    opened.device === snapshot.device &&
    opened.inode === snapshot.inode &&
    opened.fileType === snapshot.fileType)
}

function sameOpenedSnapshot(left, right) {
  return Boolean(left && right &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    (left.mode & fs.constants.S_IFMT) === (right.mode & fs.constants.S_IFMT) &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs)
}

async function readOpenedLocalImage(handle, filePath, baseDir, baseSnapshot, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  const openedBefore = await handle.stat()
  if (!openedBefore.isFile() || openedBefore.size > maxBytes) return null

  const targetSnapshot = pathSnapshot(filePath, { rejectSymbolicLink: true })
  if (!sameOpenedIdentity(openedBefore, targetSnapshot)) return null
  if (!targetSnapshot || !isInsideOrEqual(targetSnapshot.realPath, baseSnapshot.realPath)) return null

  const currentBase = pathSnapshot(baseDir)
  if (!samePathIdentity(baseSnapshot, currentBase)) return null

  const data = Buffer.allocUnsafe(openedBefore.size)
  let offset = 0
  while (offset < data.length) {
    const { bytesRead } = await handle.read(data, offset, data.length - offset, offset)
    if (bytesRead === 0) return null
    offset += bytesRead
  }
  const openedAfter = await handle.stat()
  if (!sameOpenedSnapshot(openedBefore, openedAfter)) return null

  const finalBase = pathSnapshot(baseDir)
  if (!samePathIdentity(baseSnapshot, finalBase)) return null
  return data
}

async function readLocalImageFile(filePath, baseDir, mimeByExtension, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  if (typeof filePath !== 'string' || typeof baseDir !== 'string') return null
  if (!isInsideOrEqual(filePath, baseDir)) return null

  const ext = path.extname(filePath).toLowerCase()
  const mime = mimeByExtension[ext]
  if (!mime) return null

  const baseSnapshot = pathSnapshot(baseDir)
  if (!baseSnapshot || baseSnapshot.fileType !== fs.constants.S_IFDIR) return null

  let handle
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0
    handle = await fsp.open(filePath, fs.constants.O_RDONLY | noFollow)
    const data = await readOpenedLocalImage(handle, filePath, baseDir, baseSnapshot, maxBytes)
    return data ? { mime, data } : null
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

module.exports = {
  DEFAULT_MAX_IMAGE_BYTES,
  readLocalImageFile,
  readOpenedLocalImage,
  sameOpenedIdentity
}
