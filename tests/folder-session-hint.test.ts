import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  FOLDER_SESSION_HINT_KEY,
  loadFolderSessionHint,
  normalizeFolderSessionHint,
  saveFolderSessionHint
} from '../src/lib/folderSessionHint'

const require = createRequire(import.meta.url)
const { folderDialogHintFromPayload, folderDialogOptions, normalizeFolderDialogHint } = require('../electron/folder-dialog-hint.cjs') as {
  folderDialogHintFromPayload: (payload: unknown) => string | null
  folderDialogOptions: (payload: unknown) => { properties: string[]; defaultPath?: string }
  normalizeFolderDialogHint: (value: unknown) => string | null
}

describe('folder session hint', () => {
  beforeEach(() => localStorage.clear())

  it('persists only a bounded opaque path string in renderer storage', () => {
    expect(saveFolderSessionHint(localStorage, '/Users/test/Documents')).toBe(true)
    expect(localStorage.getItem(FOLDER_SESSION_HINT_KEY)).toBe('/Users/test/Documents')
    expect(loadFolderSessionHint(localStorage)).toBe('/Users/test/Documents')
    expect(normalizeFolderSessionHint('')).toBeNull()
    expect(normalizeFolderSessionHint('/tmp/bad\0hint')).toBeNull()
    expect(normalizeFolderSessionHint('x'.repeat(4097))).toBeNull()
  })

  it('uses an absolute hint only as the Electron dialog starting location', () => {
    expect(folderDialogOptions({ hintPath: '/Users/test/Documents' })).toEqual({
      properties: ['openDirectory'],
      defaultPath: '/Users/test/Documents'
    })
    expect(folderDialogOptions({ hintPath: 'relative/path' })).toEqual({ properties: ['openDirectory'] })
    expect(folderDialogOptions({ hintPath: '/Users/test/Documents', extra: true })).toEqual({ properties: ['openDirectory'] })
    expect(folderDialogOptions(['/Users/test/Documents'])).toEqual({ properties: ['openDirectory'] })
    expect(folderDialogHintFromPayload({ hintPath: '/Users/test/Documents' })).toBe('/Users/test/Documents')
    expect(normalizeFolderDialogHint('/tmp/bad\0hint')).toBeNull()
  })
})
