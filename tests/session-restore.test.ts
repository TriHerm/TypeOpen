import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSessionIntent } from '../src/lib/sessionRestore'

const require = createRequire(import.meta.url)
const { pathSnapshot } = require('../electron/path-grants.cjs') as {
  pathSnapshot: (filePath: string, options?: { rejectSymbolicLink?: boolean }) => {
    realPath: string
    device: number
    inode: number
    fileType: number
  } | null
}

const tempRoots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-session-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function identity(snapshot: ReturnType<typeof pathSnapshot>) {
  if (!snapshot) return null
  return {
    realPath: snapshot.realPath,
    device: String(snapshot.device),
    inode: String(snapshot.inode),
    fileType: String(snapshot.fileType)
  }
}

describe('clean session restore intent', () => {
  it('keeps only saved paths in renderer intent and marks dirty saved tabs without promoting pathless buffers', () => {
    const documents = [
      { id: 'clean', filePath: '/tmp/clean.md', dirty: false },
      { id: 'dirty', filePath: '/tmp/dirty.md', dirty: true },
      { id: 'recovered', filePath: null, dirty: true }
    ]
    expect(buildSessionIntent(documents, 'dirty', (document) => document.dirty)).toEqual({
      version: 1,
      documents: [
        { id: 'clean', filePath: '/tmp/clean.md', dirty: false },
        { id: 'dirty', filePath: '/tmp/dirty.md', dirty: true }
      ],
      activeDocumentId: 'dirty'
    })
  })

  it('detects replacement, symlink, and parent rebinding against captured file identity', async () => {
    const root = await tempRoot()
    const workspace = path.join(root, 'workspace')
    const replacementParent = path.join(root, 'replacement')
    const filePath = path.join(workspace, 'note.md')
    await mkdir(workspace)
    await mkdir(replacementParent)
    await writeFile(filePath, '# One')

    const originalFile = identity(pathSnapshot(filePath, { rejectSymbolicLink: true }))
    const originalParent = identity(pathSnapshot(workspace, { rejectSymbolicLink: true }))
    expect(originalFile).toBeTruthy()
    expect(originalParent).toBeTruthy()

    const replacementPath = path.join(root, 'replacement.md')
    await writeFile(replacementPath, '# Replacement')
    expect(identity(pathSnapshot(replacementPath, { rejectSymbolicLink: true }))).not.toEqual(originalFile)
    await rename(replacementPath, filePath)
    expect(identity(pathSnapshot(filePath, { rejectSymbolicLink: true }))).not.toEqual(originalFile)

    await rm(filePath)
    const outside = path.join(root, 'outside.md')
    await writeFile(outside, '# Outside')
    await symlink(outside, filePath)
    expect(pathSnapshot(filePath, { rejectSymbolicLink: true })).toBeNull()

    await rm(workspace, { recursive: true })
    await symlink(replacementParent, workspace)
    expect(identity(pathSnapshot(workspace, { rejectSymbolicLink: true }))).not.toEqual(originalParent)
  })
})
