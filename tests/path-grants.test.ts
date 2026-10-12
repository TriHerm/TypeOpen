import { createRequire } from 'node:module'
import { link, mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createPathGrants, isInsideOrEqual, pathSnapshot } = require('../electron/path-grants.cjs') as {
  createPathGrants: () => {
    grantDocument(filePath: string, expectedSnapshot?: unknown): string
    revokeDocument(filePath: string): void
    setFolder(folderPath: string): string | null
    clearFolder(): void
    getFolder(): string | null
    getFolderRealPath(): string | null
    getFolderGrantToken(): unknown | null
    isFolderGrantCurrent(token: unknown): boolean
    isDocumentGranted(filePath: string): boolean
    getDocumentBaseGrantToken(filePath: string): unknown | null
    isDocumentBaseGrantCurrent(token: unknown): boolean
    canReadDocument(filePath: string): boolean
    canWriteDocument(filePath: string): boolean
    canListFolder(folderPath: string): boolean
    isCurrentFolder(folderPath: string): boolean
  }
  isInsideOrEqual: (targetPath: string, folderPath: string) => boolean
  pathSnapshot: (filePath: string, options?: { rejectSymbolicLink?: boolean }) => unknown | null
}

const tempRoots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-grants-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('main-process path grants', () => {
  it('allows a selected folder and descendants without granting sibling paths', async () => {
    const temp = await tempRoot()
    const root = path.join(temp, 'workspace')
    const notes = path.join(root, 'notes')
    const document = path.join(notes, 'one.md')
    const sibling = path.join(temp, 'private')
    const secret = path.join(sibling, 'secret.md')
    await mkdir(notes, { recursive: true })
    await mkdir(sibling)
    await writeFile(document, '# One')
    await writeFile(secret, '# Secret')
    const grants = createPathGrants()
    grants.setFolder(root)

    expect(grants.getFolder()).toBe(root)
    expect(grants.getFolderRealPath()).toBeTruthy()
    expect(grants.isCurrentFolder(root)).toBe(true)
    expect(grants.canListFolder(notes)).toBe(true)
    expect(grants.canReadDocument(document)).toBe(true)
    expect(grants.canReadDocument(secret)).toBe(false)
    expect(isInsideOrEqual(path.join(root, '..', 'private'), root)).toBe(false)
  })

  it('requires an explicit document grant for writes and preserves it across folder changes', async () => {
    const root = await tempRoot()
    const firstFolder = path.join(root, 'first')
    const secondFolder = path.join(root, 'second')
    const document = path.join(firstFolder, 'open.md')
    await mkdir(firstFolder)
    await mkdir(secondFolder)
    await writeFile(document, '# Open')
    const grants = createPathGrants()
    grants.setFolder(firstFolder)

    expect(grants.canReadDocument(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(false)
    grants.grantDocument(document)
    expect(grants.canWriteDocument(document)).toBe(true)

    grants.setFolder(secondFolder)
    expect(grants.canReadDocument(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(true)
    expect(grants.canReadDocument(path.join(firstFolder, 'not-opened.md'))).toBe(false)
  })

  it('revokes moved document paths without affecting the replacement grant', async () => {
    const root = await tempRoot()
    const source = path.join(root, 'source.md')
    const destination = path.join(root, 'archive', 'source.md')
    await mkdir(path.dirname(destination))
    await writeFile(source, '# Source')
    await writeFile(destination, '# Destination')
    const grants = createPathGrants()
    grants.grantDocument(source)
    grants.revokeDocument(source)
    grants.grantDocument(destination)

    expect(grants.canWriteDocument(source)).toBe(false)
    expect(grants.canWriteDocument(destination)).toBe(true)
  })

  it('invalidates an exact document grant when the path is replaced by an external symlink', async () => {
    const root = await tempRoot()
    const workspace = path.join(root, 'workspace')
    const outside = path.join(root, 'outside')
    const document = path.join(workspace, 'open.md')
    const secret = path.join(outside, 'secret.md')
    await mkdir(workspace)
    await mkdir(outside)
    await writeFile(document, '# Open')
    await writeFile(secret, '# Secret')

    const grants = createPathGrants()
    grants.setFolder(workspace)
    grants.grantDocument(document)
    expect(grants.isDocumentGranted(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(true)

    await rm(document)
    await symlink(secret, document)

    expect(grants.isDocumentGranted(document)).toBe(false)
    expect(grants.canReadDocument(document)).toBe(false)
    expect(grants.canWriteDocument(document)).toBe(false)
  })

  it('keeps document authority separate from a replaced parent-directory asset base', async () => {
    const root = await tempRoot()
    const workspace = path.join(root, 'workspace')
    const displaced = path.join(root, 'workspace-old')
    const document = path.join(workspace, 'open.md')
    await mkdir(workspace)
    await writeFile(document, '# Open')

    const grants = createPathGrants()
    grants.grantDocument(document)
    const baseToken = grants.getDocumentBaseGrantToken(document)
    expect(baseToken).toBeTruthy()

    await rename(workspace, displaced)
    await mkdir(workspace)
    await link(path.join(displaced, 'open.md'), document)

    expect(grants.isDocumentGranted(document)).toBe(true)
    expect(grants.canWriteDocument(document)).toBe(true)
    expect(grants.isDocumentBaseGrantCurrent(baseToken)).toBe(false)
    expect(grants.getDocumentBaseGrantToken(document)).toBeNull()
  })

  it('binds read promotion to the exact non-symlink snapshot that was read', async () => {
    const root = await tempRoot()
    const document = path.join(root, 'open.md')
    const outside = path.join(root, 'outside.md')
    await writeFile(document, '# Open')
    await writeFile(outside, '# Outside')
    const expected = pathSnapshot(document, { rejectSymbolicLink: true })
    expect(expected).toBeTruthy()

    await rm(document)
    await symlink(outside, document)

    const grants = createPathGrants()
    expect(() => grants.grantDocument(document, expected)).toThrow(/safe|changed/i)
    expect(grants.isDocumentGranted(document)).toBe(false)
  })

  it('revokes a folder grant if the selected folder path is replaced by a symlink', async () => {
    const root = await tempRoot()
    const workspace = path.join(root, 'workspace')
    const outside = path.join(root, 'outside')
    await mkdir(workspace)
    await mkdir(outside)
    const grants = createPathGrants()
    grants.setFolder(workspace)
    expect(grants.getFolder()).toBe(workspace)

    await rm(workspace, { recursive: true })
    await symlink(outside, workspace)

    expect(grants.getFolder()).toBeNull()
    expect(grants.isCurrentFolder(workspace)).toBe(false)
    expect(grants.canListFolder(workspace)).toBe(false)
  })

  it('revokes a folder grant if the selected directory is replaced at the same path', async () => {
    const root = await tempRoot()
    const workspace = path.join(root, 'workspace')
    const moved = path.join(root, 'workspace-old')
    await mkdir(workspace)
    const grants = createPathGrants()
    grants.setFolder(workspace)
    const token = grants.getFolderGrantToken()
    expect(token).toBeTruthy()

    await rename(workspace, moved)
    await mkdir(workspace)

    expect(grants.getFolder()).toBeNull()
    expect(grants.isFolderGrantCurrent(token)).toBe(false)
    expect(grants.canListFolder(workspace)).toBe(false)
  })

  it('invalidates a captured folder grant token when another folder is authorized', async () => {
    const root = await tempRoot()
    const first = path.join(root, 'first')
    const second = path.join(root, 'second')
    await mkdir(first)
    await mkdir(second)
    const grants = createPathGrants()
    grants.setFolder(first)
    const firstToken = grants.getFolderGrantToken()
    expect(firstToken).toBeTruthy()
    expect(grants.isFolderGrantCurrent(firstToken)).toBe(true)

    grants.setFolder(second)

    expect(grants.isFolderGrantCurrent(firstToken)).toBe(false)
    expect(grants.getFolder()).toBe(second)
  })

  it('keeps a selected root symlink authorized while its followed target identity is unchanged', async () => {
    const root = await tempRoot()
    const target = path.join(root, 'workspace-target')
    const selected = path.join(root, 'workspace-link')
    await mkdir(target)
    await symlink(target, selected)
    const grants = createPathGrants()

    grants.setFolder(selected)
    const token = grants.getFolderGrantToken()

    expect(token).toBeTruthy()
    expect(grants.getFolder()).toBe(selected)
    expect(grants.isCurrentFolder(selected)).toBe(true)
    expect(grants.isFolderGrantCurrent(token)).toBe(true)
  })
})
