const fs = require('node:fs')
const fsp = require('node:fs/promises')

async function pathExists(targetPath) {
  try {
    await fsp.lstat(targetPath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function copyDocumentPath(sourcePath, destinationPath) {
  if (await pathExists(destinationPath)) {
    const error = new Error('Destination already exists.')
    error.code = 'EEXIST'
    throw error
  }

  const stat = await fsp.lstat(sourcePath)
  if (stat.isSymbolicLink()) throw new Error('Symbolic-link documents are not supported for duplicate/move operations.')
  try {
    if (stat.isDirectory()) {
      await fsp.cp(sourcePath, destinationPath, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
    } else if (stat.isFile()) {
      await fsp.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL)
    } else {
      throw new Error('Document path is not a regular file or package directory.')
    }
  } catch (error) {
    await fsp.rm(destinationPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  return destinationPath
}

async function moveDocumentPath(sourcePath, destinationPath) {
  if (sourcePath === destinationPath) return destinationPath
  if (await pathExists(destinationPath)) {
    const error = new Error('Destination already exists.')
    error.code = 'EEXIST'
    throw error
  }

  try {
    await fsp.rename(sourcePath, destinationPath)
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error
    await copyDocumentPath(sourcePath, destinationPath)
    try {
      await fsp.rm(sourcePath, { recursive: true, force: false })
    } catch (removeError) {
      await fsp.rm(destinationPath, { recursive: true, force: true }).catch(() => undefined)
      throw removeError
    }
  }
  return destinationPath
}

module.exports = { copyDocumentPath, moveDocumentPath, pathExists }
