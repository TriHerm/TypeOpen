import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createTextBundle,
  readTextBundle,
  resolveTextBundlePayload,
  writeTextBundlePayload
} = require('../electron/textbundle.cjs') as {
  createTextBundle: (bundlePath: string, content: string) => Promise<{ payloadPath: string }>
  readTextBundle: (bundlePath: string) => Promise<{ payloadPath: string; content: string }>
  resolveTextBundlePayload: (bundlePath: string) => Promise<string>
  writeTextBundlePayload: (bundlePath: string, content: string) => Promise<{ payloadPath: string }>
}

const tempRoots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'typeopen-textbundle-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('TextBundle helpers', () => {
  it('prefers a valid info.json text payload over conventional fallback names', async () => {
    const root = await tempRoot()
    const bundle = path.join(root, 'Notes.textbundle')
    await mkdir(bundle)
    await writeFile(path.join(bundle, 'info.json'), JSON.stringify({ text: 'body.markdown' }))
    await writeFile(path.join(bundle, 'body.markdown'), '# Preferred')
    await writeFile(path.join(bundle, 'text.md'), '# Fallback')

    expect(await resolveTextBundlePayload(bundle)).toBe(path.join(bundle, 'body.markdown'))
    await expect(readTextBundle(bundle)).resolves.toMatchObject({ content: '# Preferred' })
  })

  it('rejects escaping info.json text paths and falls back to text.md', async () => {
    const root = await tempRoot()
    const bundle = path.join(root, 'Safe.textbundle')
    await mkdir(bundle)
    await writeFile(path.join(root, 'outside.md'), '# Outside')
    await writeFile(path.join(bundle, 'info.json'), JSON.stringify({ text: '../outside.md' }))
    await writeFile(path.join(bundle, 'text.md'), '# Inside')

    await expect(readTextBundle(bundle)).resolves.toMatchObject({ content: '# Inside' })
  })

  it('rejects payload paths that escape through an intermediate symlink', async () => {
    const root = await tempRoot()
    const bundle = path.join(root, 'Symlink.textbundle')
    const outside = path.join(root, 'outside')
    const outsidePayload = path.join(outside, 'secret.md')
    await mkdir(bundle)
    await mkdir(outside)
    await writeFile(outsidePayload, '# Outside')
    await symlink(outside, path.join(bundle, 'bridge'))
    await writeFile(path.join(bundle, 'info.json'), JSON.stringify({ text: 'bridge/secret.md' }))

    await expect(readTextBundle(bundle)).rejects.toThrow(/readable text payload/)
    await expect(writeTextBundlePayload(bundle, '# Changed')).rejects.toThrow(/readable text payload/)
    await expect(readFile(outsidePayload, 'utf8')).resolves.toBe('# Outside')
  })

  it('updates only the selected text payload of an existing bundle', async () => {
    const root = await tempRoot()
    const bundle = path.join(root, 'Existing.textbundle')
    const assets = path.join(bundle, 'assets')
    const info = JSON.stringify({ version: 2, text: 'text.txt', custom: 'keep-me' }, null, 2)
    await mkdir(assets, { recursive: true })
    await writeFile(path.join(bundle, 'info.json'), info)
    await writeFile(path.join(bundle, 'text.txt'), 'Before')
    await writeFile(path.join(assets, 'image.png'), 'asset-bytes')

    await writeTextBundlePayload(bundle, 'After')

    await expect(readFile(path.join(bundle, 'text.txt'), 'utf8')).resolves.toBe('After')
    await expect(readFile(path.join(bundle, 'info.json'), 'utf8')).resolves.toBe(info)
    await expect(readFile(path.join(assets, 'image.png'), 'utf8')).resolves.toBe('asset-bytes')
  })

  it('creates a new bundle with text.md, minimal metadata and assets directory', async () => {
    const root = await tempRoot()
    const bundle = path.join(root, 'Created.textbundle')

    await createTextBundle(bundle, '# Created')

    await expect(readFile(path.join(bundle, 'text.md'), 'utf8')).resolves.toBe('# Created')
    const info = JSON.parse(await readFile(path.join(bundle, 'info.json'), 'utf8'))
    expect(info).toEqual({
      version: 2,
      type: 'net.daringfireball.markdown',
      creatorIdentifier: 'com.triherm.typeopen',
      text: 'text.md'
    })
    expect((await stat(path.join(bundle, 'assets'))).isDirectory()).toBe(true)
  })
})
