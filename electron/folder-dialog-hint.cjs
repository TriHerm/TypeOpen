const path = require('node:path')

const MAX_FOLDER_DIALOG_HINT_LENGTH = 4096

function normalizeFolderDialogHint(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FOLDER_DIALOG_HINT_LENGTH || value.includes('\0')) return null
  if (!path.isAbsolute(value)) return null
  return value
}

function folderDialogHintFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const keys = Object.keys(payload)
  if (keys.length !== 1 || keys[0] !== 'hintPath') return null
  return normalizeFolderDialogHint(payload.hintPath)
}

function folderDialogOptions(payload) {
  const hintPath = folderDialogHintFromPayload(payload)
  return {
    properties: ['openDirectory'],
    ...(hintPath ? { defaultPath: hintPath } : {})
  }
}

module.exports = {
  MAX_FOLDER_DIALOG_HINT_LENGTH,
  folderDialogHintFromPayload,
  folderDialogOptions,
  normalizeFolderDialogHint
}
