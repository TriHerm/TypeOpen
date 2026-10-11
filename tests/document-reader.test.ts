import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createPathGrants } = require('../electron/path-grants.cjs') as {
  createPathGrants: () => {
    setFolder(folderPath: string): string
    isDocumentGranted(filePath: string): boolean
    canReadDocument(filePath: string): boolean
    canWriteDocument(filePath: string): boolean
  }
}
const { readAndGrantDocument } = require('../electron/document-reader.cjs') as {
  readAndGrantDocument(args: {
    filePath: string
    pathGrants: ReturnType<typeof createPathGrants>
    assertReadableDocumentPath(filePath: string): Promise<void>
    readDocumentFromSnapshot(filePath: string, snapshot: unknown): Promise<string>
  }): Promise<{ filePath: string; content: string; imported: boolean }>
}

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-document-reader-'))
  tempRoots.push(root)
  const grants = createPathGrants()
  grants.setFolder(root)
  const invoke = (filePath: string) => readAndGrantDocument({
    filePath,
    pathGrants: grants,
    assertReadableDocumentPath: async (candidate) => {
      if (!grants.canReadDocument(candidate)) throw new Error('Document path has not been granted by the user.')
    },
    readDocumentFromSnapshot: async (candidate) => readFile(candidate, 'utf8')
  })
  return { root, grants, invoke }
}

describe('Electron editable-document read boundary', () => {
  it('promotes a supported document from folder-read authority to an exact write grant', async () => {
    const { root, grants, invoke } = await createWorkspace()
    const document = path.join(root, 'note.md')
    await writeFile(document, '# Note')

    expect(grants.canReadDocument(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(false)
    await expect(invoke(document)).resolves.toMatchObject({ filePath: document, content: '# Note', imported: false })
    expect(grants.isDocumentGranted(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(true)
  })

  it('rejects an image without promoting it to an exact document grant', async () => {
    const { root, grants, invoke } = await createWorkspace()
    const image = path.join(root, 'diagram.svg')
    await writeFile(image, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')

    expect(grants.canReadDocument(image)).toBe(true)
    expect(grants.canWriteDocument(image)).toBe(false)
    await expect(invoke(image)).rejects.toThrow(/supported document type/i)
    expect(grants.isDocumentGranted(image)).toBe(false)
    expect(grants.canWriteDocument(image)).toBe(false)
  })
})
