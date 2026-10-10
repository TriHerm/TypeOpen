const { contextBridge, ipcRenderer } = require('electron')

const invokeChannels = new Set([
  'typeopen:open-file',
  'typeopen:open-folder',
  'typeopen:choose-theme-css',
  'typeopen:read-file',
  'typeopen:list-folder',
  'typeopen:search-folder',
  'typeopen:save-file',
  'typeopen:save-file-as',
  'typeopen:duplicate-document',
  'typeopen:rename-document',
  'typeopen:move-document',
  'typeopen:export-html',
  'typeopen:export-pdf',
  'typeopen:export-image',
  'typeopen:print-html',
  'typeopen:export-pandoc',
  'typeopen:pandoc-status',
  'typeopen:save-image',
  'typeopen:resolve-image-preview',
  'typeopen:clipboard-read',
  'typeopen:clipboard-write',
  'typeopen:show-item',
  'typeopen:open-external',
  'typeopen:confirm-discard'
])

contextBridge.exposeInMainWorld('typeopen', {
  platform: process.platform,
  invoke(channel, payload) {
    if (!invokeChannels.has(channel)) throw new Error(`Blocked IPC channel: ${channel}`)
    return ipcRenderer.invoke(channel, payload)
  },
  setDocumentState(state) {
    ipcRenderer.send('typeopen:document-state', state)
  },
  rendererReady() {
    ipcRenderer.send('typeopen:renderer-ready')
  },
  closeAfterSave() {
    ipcRenderer.send('typeopen:close-after-save')
  },
  onCommand(callback) {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('typeopen:command', listener)
    return () => ipcRenderer.removeListener('typeopen:command', listener)
  },
  onFileChanged(callback) {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('typeopen:file-changed', listener)
    return () => ipcRenderer.removeListener('typeopen:file-changed', listener)
  }
})
