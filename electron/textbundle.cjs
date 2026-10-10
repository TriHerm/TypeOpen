const fsp = require('node:fs/promises')
const path = require('node:path')

const TEXTBUNDLE_EXTENSION = '.textbundle'
const TEXTBUNDLE_FALLBACK_PAYLOADS = ['text.md', 'text.markdown', 'text.txt']
const TEXTBUNDLE_INFO = {
  version: 2,
  type: 'net.daringfireball.markdown',
  creatorIdentifier: 'com.triherm.typeopen',
  text: 'text.md'
}

function isTextBundlePath(filePath) {
  return typeof filePath === 'string' && path.extname(filePath).toLowerCase() === TEXTBUNDLE_EXTENSION
}

function resolveInsideBundle(bundlePath, candidate) {
  if (typeof candidate !== 'string' || !candidate || path.isAbsolute(candidate)) return null
  const resolved = path.resolve(bundlePath, candidate)
  const relative = path.relative(path.resolve(bundlePath), resolved)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
  return resolved
}

function isInsideOrEqual(targetPath, rootPath) {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function isSafeRegularPayload(filePath, bundleRealPath) {
  try {
    const stat = await fsp.lstat(filePath)
    if (!stat.isFile() || stat.isSymbolicLink()) return false
    const payloadRealPath = await fsp.realpath(filePath)
    return isInsideOrEqual(payloadRealPath, bundleRealPath)
  } catch {
    return false
  }
}

async function readInfo(bundlePath) {
  try {
    const raw = await fsp.readFile(path.join(bundlePath, 'info.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function resolveTextBundlePayload(bundlePath) {
  if (!isTextBundlePath(bundlePath)) throw new Error('Not a TextBundle path.')
  const stat = await fsp.stat(bundlePath)
  if (!stat.isDirectory()) throw new Error('TextBundle must be a directory package.')
  const bundleRealPath = await fsp.realpath(bundlePath)

  const info = await readInfo(bundlePath)
  const candidates = []
  if (typeof info?.text === 'string') candidates.push(info.text)
  candidates.push(...TEXTBUNDLE_FALLBACK_PAYLOADS)

  const seen = new Set()
  for (const candidate of candidates) {
    const payloadPath = resolveInsideBundle(bundlePath, candidate)
    if (!payloadPath || seen.has(payloadPath)) continue
    seen.add(payloadPath)
    if (await isSafeRegularPayload(payloadPath, bundleRealPath)) return payloadPath
  }

  throw new Error('TextBundle does not contain a readable text payload.')
}

async function readTextBundle(bundlePath) {
  const payloadPath = await resolveTextBundlePayload(bundlePath)
  return { payloadPath, content: await fsp.readFile(payloadPath, 'utf8') }
}

async function writeTextBundlePayload(bundlePath, content) {
  const payloadPath = await resolveTextBundlePayload(bundlePath)
  await fsp.writeFile(payloadPath, content, 'utf8')
  return { payloadPath }
}

async function createTextBundle(bundlePath, content) {
  if (!isTextBundlePath(bundlePath)) throw new Error('TextBundle destination must end in .textbundle.')
  let created = false
  try {
    await fsp.mkdir(bundlePath)
    created = true
    await fsp.mkdir(path.join(bundlePath, 'assets'))
    await fsp.writeFile(path.join(bundlePath, 'text.md'), content, 'utf8')
    await fsp.writeFile(path.join(bundlePath, 'info.json'), `${JSON.stringify(TEXTBUNDLE_INFO, null, 2)}\n`, 'utf8')
    return { payloadPath: path.join(bundlePath, 'text.md') }
  } catch (error) {
    if (created) await fsp.rm(bundlePath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

module.exports = {
  TEXTBUNDLE_EXTENSION,
  TEXTBUNDLE_FALLBACK_PAYLOADS,
  TEXTBUNDLE_INFO,
  createTextBundle,
  isTextBundlePath,
  readTextBundle,
  resolveTextBundlePayload,
  writeTextBundlePayload
}
