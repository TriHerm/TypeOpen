(() => {
  const invokeChannels = new Set([
    'typeopen:open-file',
    'typeopen:open-folder',
    'typeopen:choose-theme-css',
    'typeopen:read-file',
    'typeopen:list-folder',
    'typeopen:search-folder',
    'typeopen:create-entry',
    'typeopen:rename-entry',
    'typeopen:trash-entry',
    'typeopen:load-recovery',
    'typeopen:save-recovery',
    'typeopen:clear-recovery',
    'typeopen:save-session',
    'typeopen:restore-session',
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
    'typeopen:confirm-discard',
    'typeopen:confirm-external-reload'
  ])

  let nextRequestId = 1
  const pending = new Map()
  const commandListeners = new Set()
  const fileChangedListeners = new Set()

  function post(message) {
    const handler = window.webkit?.messageHandlers?.typeopen
    if (!handler) throw new Error('TypeOpen native bridge is unavailable.')
    handler.postMessage(message)
  }

  Object.defineProperty(window, '__typeopenResolve', {
    configurable: false,
    enumerable: false,
    writable: false,
    value(packet) {
      const request = pending.get(packet?.id)
      if (!request) return
      pending.delete(packet.id)
      if (packet.ok) request.resolve(packet.value)
      else request.reject(new Error(typeof packet.error === 'string' ? packet.error : 'Native operation failed.'))
    }
  })

  Object.defineProperty(window, '__typeopenDispatchCommand', {
    configurable: false,
    enumerable: false,
    writable: false,
    value(message) {
      for (const listener of [...commandListeners]) listener(message)
    }
  })

  Object.defineProperty(window, '__typeopenDispatchFileChanged', {
    configurable: false,
    enumerable: false,
    writable: false,
    value(message) {
      for (const listener of [...fileChangedListeners]) listener(message)
    }
  })

  const api = {
    platform: 'darwin',
    invoke(channel, payload) {
      if (!invokeChannels.has(channel)) return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
      const id = nextRequestId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          post({ kind: 'invoke', id, channel, payload: payload ?? null })
        } catch (error) {
          pending.delete(id)
          reject(error)
        }
      })
    },
    setDocumentState(state) {
      post({ kind: 'event', event: 'document-state', payload: state })
    },
    rendererReady() {
      post({ kind: 'event', event: 'renderer-ready' })
    },
    closeAfterSave() {
      post({ kind: 'event', event: 'close-after-save' })
    },
    onCommand(callback) {
      commandListeners.add(callback)
      return () => commandListeners.delete(callback)
    },
    onFileChanged(callback) {
      fileChangedListeners.add(callback)
      return () => fileChangedListeners.delete(callback)
    }
  }

  Object.defineProperty(window, 'typeopen', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze(api)
  })
})()
