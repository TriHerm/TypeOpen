import { createRequire } from 'node:module'
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { copyDocumentPath, moveDocumentPath } = require('../electron/file-ops.cjs') as {
  copyDocumentPath: (source: string, destination: string) => Promise<string>
  moveDocumentPath: (source: string, destination: string) => Promise<string>
}

const roots: string[] = []
async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-file-ops-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('document filesystem operations', () => {
  it('duplicates a TextBundle as a complete package without mutating the source', async () => {
    const root = await tempRoot()
    const source = path.join(root, 'Source.textbundle')
    const destination = path.join(root, 'Copy.textbundle')
    await mkdir(path.join(source, 'assets'), { recursive: true })
    await writeFile(path.join(source, 'info.json'), '{"text":"text.md","custom":true}')
    await writeFile(path.join(source, 'text.md'), '# Source')
    await writeFile(path.join(source, 'assets', 'image.png'), 'asset')

    await copyDocumentPath(source, destination)

    await expect(readFile(path.join(destination, 'info.json'), 'utf8')).resolves.toContain('"custom":true')
    await expect(readFile(path.join(destination, 'text.md'), 'utf8')).resolves.toBe('# Source')
    await expect(readFile(path.join(destination, 'assets', 'image.png'), 'utf8')).resolves.toBe('asset')
    await expect(readFile(path.join(source, 'text.md'), 'utf8')).resolves.toBe('# Source')
  })

  it('moves a regular document without overwriting an existing destination', async () => {
    const root = await tempRoot()
    const source = path.join(root, 'source.md')
    const destination = path.join(root, 'moved.md')
    await writeFile(source, '# Move')
    await moveDocumentPath(source, destination)
    await expect(readFile(destination, 'utf8')).resolves.toBe('# Move')
    await expect(readFile(source, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    const other = path.join(root, 'other.md')
    await writeFile(other, '# Other')
    await expect(moveDocumentPath(destination, other)).rejects.toMatchObject({ code: 'EEXIST' })
  })

  it('does not leave a destination behind when a copy is rejected', async () => {
    const root = await tempRoot()
    const source = path.join(root, 'source.md')
    const destination = path.join(root, 'copy.md')
    await writeFile(source, '# Source')
    const symbolicSource = path.join(root, 'symbolic.md')
    await symlink(source, symbolicSource)

    await expect(copyDocumentPath(symbolicSource, destination)).rejects.toThrow(/Symbolic-link documents/)
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(source, 'utf8')).resolves.toBe('# Source')
  })
})
