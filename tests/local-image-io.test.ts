import { createRequire } from 'node:module'
import { mkdir, mkdtemp, open, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createPathGrants, pathSnapshot } = require('../electron/path-grants.cjs') as {
  createPathGrants(): {
    setFolder(folderPath: string): string
    getFolderGrantToken(): (NonNullable<ReturnType<typeof pathSnapshot>> & { path: string }) | null
    isFolderGrantCurrent(token: NonNullable<ReturnType<ReturnType<typeof createPathGrants>['getFolderGrantToken']>>): boolean
  }
  pathSnapshot(filePath: string, options?: { rejectSymbolicLink?: boolean }): {
    realPath: string
    device: number
    inode: number
    fileType: number
    size: number
    mtimeMs: number
  } | null
}
const { readLocalImageFile, readOpenedLocalImage } = require('../electron/local-image-io.cjs') as {
  readLocalImageFile(filePath: string, baseDir: string, mimeByExtension: Record<string, string>, options?: {
    maxBytes?: number
    expectedBaseSnapshot?: NonNullable<ReturnType<typeof pathSnapshot>>
    isAuthorityCurrent?: () => boolean
  }): Promise<{ mime: string; data: Buffer } | null>
  readOpenedLocalImage(handle: Awaited<ReturnType<typeof open>>, filePath: string, baseDir: string, baseSnapshot: NonNullable<ReturnType<typeof pathSnapshot>>, maxBytes?: number): Promise<Buffer | null>
}

const MIME = { '.png': 'image/png' }
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function workspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-local-image-'))
  tempRoots.push(root)
  return root
}

describe('bound local image reads', () => {
  it('reads a regular image through the opened descriptor', async () => {
    const root = await workspace()
    const image = path.join(root, 'asset.png')
    await writeFile(image, Buffer.from('image-bytes'))

    const result = await readLocalImageFile(image, root, MIME)
    expect(result?.mime).toBe('image/png')
    expect(result?.data.toString()).toBe('image-bytes')
  })

  it('rejects a final-path symbolic link even when its target is readable', async () => {
    const root = await workspace()
    const outside = await mkdtemp(path.join(os.tmpdir(), 'typeopen-local-image-outside-'))
    tempRoots.push(outside)
    const target = path.join(outside, 'outside.png')
    const link = path.join(root, 'asset.png')
    await writeFile(target, Buffer.from('outside'))
    await symlink(target, link)

    await expect(readLocalImageFile(link, root, MIME)).resolves.toBeNull()
  })

  it('rejects a pathname replaced after its original file descriptor was opened', async () => {
    const root = await workspace()
    const image = path.join(root, 'asset.png')
    const displaced = path.join(root, 'asset-old.png')
    await writeFile(image, Buffer.from('original'))
    const baseSnapshot = pathSnapshot(root)
    expect(baseSnapshot).not.toBeNull()

    const handle = await open(image, 'r')
    try {
      await rename(image, displaced)
      await writeFile(image, Buffer.from('replacement'))
      await expect(readOpenedLocalImage(handle, image, root, baseSnapshot!)).resolves.toBeNull()
    } finally {
      await handle.close()
    }
  })

  it('rejects files larger than the configured bound', async () => {
    const root = await workspace()
    const image = path.join(root, 'asset.png')
    await writeFile(image, Buffer.from('12345'))

    await expect(readLocalImageFile(image, root, MIME, { maxBytes: 4 })).resolves.toBeNull()
  })

  it('rejects a stale folder path after the authorized folder identity is replaced', async () => {
    const root = await workspace()
    const displaced = `${root}-old`
    tempRoots.push(displaced)
    const grants = createPathGrants()
    grants.setFolder(root)
    const token = grants.getFolderGrantToken()
    expect(token).not.toBeNull()

    await rename(root, displaced)
    await mkdir(root)
    await writeFile(path.join(root, 'asset.png'), Buffer.from('replacement'))

    expect(grants.isFolderGrantCurrent(token!)).toBe(false)
    await expect(readLocalImageFile(path.join(root, 'asset.png'), root, MIME, {
      expectedBaseSnapshot: token!,
      isAuthorityCurrent: () => grants.isFolderGrantCurrent(token!)
    })).resolves.toBeNull()
  })
})
