const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard, nativeTheme } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { fileURLToPath } = require('node:url')
const { execFile, execFileSync } = require('node:child_process')
const { promisify } = require('node:util')
const {
  createTextBundle,
  isTextBundlePath,
  readTextBundle,
  resolveTextBundlePayload,
  writeTextBundlePayload
} = require('./textbundle.cjs')
const { copyDocumentPath, moveDocumentPath, pathExists } = require('./file-ops.cjs')
const { MAX_THEME_CSS_BYTES, sanitizeThemeCss } = require('./theme-css.cjs')
const { createPathGrants, isInsideOrEqual } = require('./path-grants.cjs')

const execFileAsync = promisify(execFile)
const DEV_SERVER = process.env.VITE_DEV_SERVER_URL
const MARKDOWN_EXTENSIONS = new Set([
  '.md', '.markdown', '.mmd', '.mdown', '.mkd', '.mdwn', '.mdtxt', '.mdtext', '.rmarkdown', '.rmd', '.apib', '.qmd', '.mdx', '.txt', '.text'
])
const PANDOC_IMPORT_EXTENSIONS = new Set(['.docx', '.odt', '.rtf', '.epub', '.tex', '.latex', '.ltx', '.rst', '.rest', '.org', '.wiki', '.textile', '.opml'])
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif'
}
const GLOBAL_SEARCH_MAX_RESULTS = 250
const GLOBAL_SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024
const BLOCKED_IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

let mainWindow = null
let documentState = {
  filePath: null,
  folderPath: null,
  dirty: false,
  hasDirtyDocuments: false,
  title: 'Untitled'
}
let forceClose = false
let pendingOpenPath = null
const pathGrants = createPathGrants()

function assertTrustedRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('IPC request did not originate from the active TypeOpen renderer.')
  }
}

function grantOpenedDocument(filePath) {
  return pathGrants.grantDocument(filePath)
}

async function isRealPathInsideOrEqual(targetPath, folderPath) {
  try {
    const [targetRealPath, folderRealPath] = await Promise.all([fsp.realpath(targetPath), fsp.realpath(folderPath)])
    return isInsideOrEqual(targetRealPath, folderRealPath)
  } catch {
    return false
  }
}

async function assertReadableDocumentPath(filePath) {
  if (pathGrants.isDocumentGranted(filePath)) return
  const folderPath = pathGrants.getFolder()
  if (!folderPath || !pathGrants.canReadDocument(filePath) || !await isRealPathInsideOrEqual(filePath, folderPath)) {
    throw new Error('Document path has not been granted by the user.')
  }
}

async function assertListableFolderPath(folderPath) {
  const grantedFolder = pathGrants.getFolder()
  if (!grantedFolder || !pathGrants.canListFolder(folderPath) || !await isRealPathInsideOrEqual(folderPath, grantedFolder)) {
    throw new Error('Folder path has not been granted by the user.')
  }
}

function assertWritableDocumentPath(filePath) {
  if (!pathGrants.canWriteDocument(filePath)) throw new Error('Document path is not open for writing.')
}

function sendCommand(command, payload = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('typeopen:command', { command, payload })
  }
}

function sendFileChanged(filePath) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('typeopen:file-changed', { filePath })
  }
}

function isEditableDocument(filePath) {
  return isTextBundlePath(filePath) || MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || PANDOC_IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function documentFilters() {
  return [
    { name: 'Markdown & Text', extensions: ['md', 'markdown', 'mmd', 'mdown', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'rmarkdown', 'rmd', 'apib', 'qmd', 'mdx', 'txt', 'text'] },
    { name: 'TextBundle', extensions: ['textbundle'] },
    { name: 'Documents via Pandoc', extensions: ['docx', 'odt', 'rtf', 'epub', 'tex', 'latex', 'rst', 'org', 'opml'] },
    { name: 'All Files', extensions: ['*'] }
  ]
}

function defaultExportName(extension) {
  const source = documentState.filePath ? path.basename(documentState.filePath, path.extname(documentState.filePath)) : 'Untitled'
  return `${source}.${extension.replace(/^\./, '')}`
}

function runPandoc(args, options = {}) {
  return execFileAsync('pandoc', args, { maxBuffer: 64 * 1024 * 1024, ...options })
}

function hasPandoc() {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function readDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (isTextBundlePath(filePath)) {
    return (await readTextBundle(filePath)).content
  }
  if (PANDOC_IMPORT_EXTENSIONS.has(ext)) {
    if (!hasPandoc()) {
      throw new Error(`Pandoc is required to import ${ext || 'this document'} files.`)
    }
    const { stdout } = await runPandoc([filePath, '--to=gfm+yaml_metadata_block'])
    return stdout
  }
  return fsp.readFile(filePath, 'utf8')
}

async function listDirectory(rootPath, depth = 0) {
  if (depth > 14) return []
  const entries = await fsp.readdir(rootPath, { withFileTypes: true })
  const visible = entries
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'Library')
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

  const result = []
  for (const entry of visible) {
    const absolutePath = path.join(rootPath, entry.name)
    if (entry.isDirectory() && isTextBundlePath(absolutePath)) {
      result.push({ type: 'file', name: entry.name, path: absolutePath })
    } else if (entry.isDirectory()) {
      result.push({
        type: 'directory',
        name: entry.name,
        path: absolutePath,
        children: await listDirectory(absolutePath, depth + 1)
      })
    } else if (isEditableDocument(absolutePath) || IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      result.push({ type: 'file', name: entry.name, path: absolutePath })
    }
  }
  return result
}

async function searchFolder(rootPath, { query, matchCase = false } = {}, results = [], authorizedRoot = pathGrants.getFolder()) {
  if (!rootPath || !authorizedRoot || pathGrants.getFolder() !== authorizedRoot || typeof query !== 'string' || !query || results.length >= GLOBAL_SEARCH_MAX_RESULTS) {
    return results
  }

  if (!isInsideOrEqual(rootPath, authorizedRoot) || !await isRealPathInsideOrEqual(rootPath, authorizedRoot)) return results

  let entries
  try {
    entries = await fsp.readdir(rootPath, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (pathGrants.getFolder() !== authorizedRoot) break
    if (results.length >= GLOBAL_SEARCH_MAX_RESULTS) break
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

    const absolutePath = path.join(rootPath, entry.name)
    if (entry.isDirectory() && isTextBundlePath(absolutePath)) {
      try {
        const payloadPath = await resolveTextBundlePayload(absolutePath)
        const stat = await fsp.stat(payloadPath)
        if (stat.size > GLOBAL_SEARCH_MAX_FILE_BYTES) continue
        const content = await fsp.readFile(payloadPath, 'utf8')
        appendSearchMatches(absolutePath, path.relative(authorizedRoot, absolutePath), content, query, matchCase, results)
      } catch {
        // Ignore malformed or unreadable bundles while searching the folder.
      }
      continue
    }
    if (entry.isDirectory()) {
      await searchFolder(absolutePath, { query, matchCase }, results, authorizedRoot)
      continue
    }
    if (!entry.isFile() || !MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue

    try {
      const stat = await fsp.stat(absolutePath)
      if (stat.size > GLOBAL_SEARCH_MAX_FILE_BYTES) continue
      const content = await fsp.readFile(absolutePath, 'utf8')
      appendSearchMatches(absolutePath, path.relative(authorizedRoot, absolutePath), content, query, matchCase, results)
    } catch {
      // Ignore files that become unreadable or disappear while scanning.
    }
  }

  return results
}

function appendSearchMatches(filePath, relativePath, content, query, matchCase, results) {
  const needle = matchCase ? query : query.toLocaleLowerCase()
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (results.length >= GLOBAL_SEARCH_MAX_RESULTS) break
    const haystack = matchCase ? line : line.toLocaleLowerCase()
    const column = haystack.indexOf(needle)
    if (column < 0) continue

    const start = Math.max(0, column - 60)
    const end = Math.min(line.length, column + query.length + 100)
    const previewText = line.slice(start, end).replace(/\s+/g, ' ').trim()
    results.push({
      filePath,
      relativePath,
      line: index + 1,
      preview: `${start > 0 ? '…' : ''}${previewText}${end < line.length ? '…' : ''}`
    })
  }
}

async function chooseOpenFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: documentFilters()
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  grantOpenedDocument(filePath)
  return {
    filePath,
    imported: PANDOC_IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  }
}

async function chooseOpenFolder() {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  const folderPath = result.filePaths[0]
  pathGrants.setFolder(folderPath)
  return { folderPath, tree: await listDirectory(folderPath) }
}

async function chooseThemeCss() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Custom Theme CSS',
    properties: ['openFile'],
    filters: [{ name: 'CSS', extensions: ['css'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const stat = await fsp.stat(filePath)
  if (!stat.isFile()) throw new Error('Custom theme must be a regular CSS file.')
  if (stat.size > MAX_THEME_CSS_BYTES) throw new Error('Theme CSS is too large (512 KiB maximum).')
  const css = sanitizeThemeCss(await fsp.readFile(filePath, 'utf8'))
  return { name: path.basename(filePath), css }
}

function duplicateDefaultPath(sourcePath) {
  const ext = path.extname(sourcePath)
  const stem = path.basename(sourcePath, ext)
  return path.join(path.dirname(sourcePath), `${stem} copy${ext}`)
}

function assertSameDocumentExtension(sourcePath, destinationPath) {
  const sourceExt = path.extname(sourcePath).toLowerCase()
  const destinationExt = path.extname(destinationPath).toLowerCase()
  if (sourceExt !== destinationExt) {
    throw new Error(`Keep the ${sourceExt || 'original'} extension for this document operation.`)
  }
}

async function duplicateDocument(sourcePath, content) {
  assertWritableDocumentPath(sourcePath)
  if (!sourcePath || !isEditableDocument(sourcePath) || !await pathExists(sourcePath)) throw new Error('The current document is not a saved local document.')
  const ext = path.extname(sourcePath).replace(/^\./, '')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Duplicate Document',
    buttonLabel: 'Duplicate',
    defaultPath: duplicateDefaultPath(sourcePath),
    filters: ext ? [{ name: 'Document', extensions: [ext] }] : undefined
  })
  if (result.canceled || !result.filePath) return null
  assertSameDocumentExtension(sourcePath, result.filePath)
  if (path.resolve(result.filePath) === path.resolve(sourcePath)) throw new Error('Choose a different name or location for the duplicate.')
  await copyDocumentPath(sourcePath, result.filePath)
  try {
    if (typeof content === 'string') {
      if (isTextBundlePath(result.filePath)) await writeTextBundlePayload(result.filePath, content)
      else await fsp.writeFile(result.filePath, content, 'utf8')
    }
  } catch (error) {
    await fsp.rm(result.filePath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  app.addRecentDocument(result.filePath)
  pathGrants.grantDocument(result.filePath)
  return { filePath: result.filePath }
}

async function renameDocument(sourcePath) {
  assertWritableDocumentPath(sourcePath)
  if (!sourcePath || !isEditableDocument(sourcePath) || !await pathExists(sourcePath)) throw new Error('The current document is not a saved local document.')
  const ext = path.extname(sourcePath).replace(/^\./, '')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Rename Document',
    buttonLabel: 'Rename',
    defaultPath: sourcePath,
    filters: ext ? [{ name: 'Document', extensions: [ext] }] : undefined
  })
  if (result.canceled || !result.filePath) return null
  assertSameDocumentExtension(sourcePath, result.filePath)
  if (path.dirname(path.resolve(result.filePath)) !== path.dirname(path.resolve(sourcePath))) {
    throw new Error('Rename keeps the document in its current folder. Use Move To for another folder.')
  }
  if (path.resolve(result.filePath) === path.resolve(sourcePath)) return { filePath: sourcePath }
  await moveDocumentPath(sourcePath, result.filePath)
  app.addRecentDocument(result.filePath)
  pathGrants.revokeDocument(sourcePath)
  pathGrants.grantDocument(result.filePath)
  return { filePath: result.filePath }
}

async function moveDocument(sourcePath) {
  assertWritableDocumentPath(sourcePath)
  if (!sourcePath || !isEditableDocument(sourcePath) || !await pathExists(sourcePath)) throw new Error('The current document is not a saved local document.')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Move Document To',
    buttonLabel: 'Move',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const destination = path.join(result.filePaths[0], path.basename(sourcePath))
  if (path.resolve(destination) === path.resolve(sourcePath)) return { filePath: sourcePath }
  await moveDocumentPath(sourcePath, destination)
  app.addRecentDocument(destination)
  pathGrants.revokeDocument(sourcePath)
  pathGrants.grantDocument(destination)
  return { filePath: destination }
}

async function writeDocument({ filePath, content, saveAs = false, suggestedName }) {
  if (typeof content !== 'string') throw new Error('Document content must be text.')
  let destination = filePath === undefined ? documentState.filePath : filePath
  if (!saveAs && destination) assertWritableDocumentPath(destination)
  if (saveAs || !destination) {
    const defaultName = typeof suggestedName === 'string' && suggestedName
      ? path.basename(suggestedName)
      : `${documentState.title || 'Untitled'}.md`
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: destination || defaultName,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Plain Text', extensions: ['txt'] },
        { name: 'TextBundle', extensions: ['textbundle'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return null
    destination = result.filePath
  }
  if (isTextBundlePath(destination)) {
    let exists = false
    try {
      await fsp.stat(destination)
      exists = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    if (exists) await writeTextBundlePayload(destination, content)
    else await createTextBundle(destination, content)
  } else {
    await fsp.writeFile(destination, content, 'utf8')
  }
  app.addRecentDocument(destination)
  pathGrants.grantDocument(destination)
  return { filePath: destination }
}

function documentBaseDirectory() {
  if (documentState.filePath && pathGrants.isDocumentGranted(documentState.filePath)) {
    return isTextBundlePath(documentState.filePath) ? documentState.filePath : path.dirname(documentState.filePath)
  }
  return pathGrants.getFolder()
}

async function resolveImagePreview(source) {
  if (typeof source !== 'string' || !source) return source
  if (/^(?:data:|blob:|https?:)/i.test(source)) return source
  const baseDir = documentBaseDirectory()
  if (!baseDir) return BLOCKED_IMAGE_DATA_URL

  try {
    let localPath = source
    if (/^file:/i.test(source)) localPath = fileURLToPath(source)
    else if (!path.isAbsolute(source)) localPath = path.resolve(baseDir, decodeURIComponent(source.split(/[?#]/, 1)[0]))
    if (!isInsideOrEqual(localPath, baseDir) || !await isRealPathInsideOrEqual(localPath, baseDir)) return BLOCKED_IMAGE_DATA_URL
    const ext = path.extname(localPath).toLowerCase()
    const mime = IMAGE_MIME_TYPES[ext]
    if (!mime) return BLOCKED_IMAGE_DATA_URL
    const stat = await fsp.stat(localPath)
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) return BLOCKED_IMAGE_DATA_URL
    const data = await fsp.readFile(localPath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return BLOCKED_IMAGE_DATA_URL
  }
}

async function inlineLocalImages(html) {
  const baseDir = documentBaseDirectory()
  const pattern = /(<img\b[^>]*?\bsrc=["'])([^"']+)(["'][^>]*>)/gi
  const replacements = []
  for (const match of html.matchAll(pattern)) {
    const source = match[2]
    if (/^(?:data:|https?:|blob:|#)/i.test(source)) continue
    let replacement = BLOCKED_IMAGE_DATA_URL
    if (!baseDir) {
      replacements.push({ source, dataUrl: replacement })
      continue
    }
    try {
      let localPath = source
      if (/^file:/i.test(source)) localPath = fileURLToPath(source)
      else if (!path.isAbsolute(source)) localPath = path.resolve(baseDir, decodeURIComponent(source.split(/[?#]/, 1)[0]))
      if (!isInsideOrEqual(localPath, baseDir) || !await isRealPathInsideOrEqual(localPath, baseDir)) {
        replacements.push({ source, dataUrl: replacement })
        continue
      }
      if (!fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) {
        replacements.push({ source, dataUrl: replacement })
        continue
      }
      const ext = path.extname(localPath).toLowerCase()
      const mime = IMAGE_MIME_TYPES[ext]
      if (!mime) {
        replacements.push({ source, dataUrl: replacement })
        continue
      }
      const data = await fsp.readFile(localPath)
      replacement = `data:${mime};base64,${data.toString('base64')}`
    } catch {
      // Block unresolved local sources rather than passing a file path to Chromium.
    }
    replacements.push({ source, dataUrl: replacement })
  }
  let result = html
  for (const { source, dataUrl } of replacements) result = result.replaceAll(source, dataUrl)
  return result
}

async function exportHtml({ html, styled = true }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultExportName('html'),
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  })
  if (result.canceled || !result.filePath) return null
  let output = await inlineLocalImages(html)
  if (!styled) {
    output = output.replace(/<style[\s\S]*?<\/style>/gi, '')
  }
  await fsp.writeFile(result.filePath, output, 'utf8')
  return { filePath: result.filePath }
}

async function createRenderWindow(html) {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
  await win.webContents.executeJavaScript('document.fonts && document.fonts.ready')
  return win
}

const PAGE_SIZES = new Set(['Letter', 'A4', 'Legal', 'A5', 'Tabloid'])

function normalizePageSetup(value) {
  const clampMargin = (input) => Math.max(0, Math.min(3, Number.isFinite(Number(input)) ? Number(input) : 0.5))
  const paperSize = PAGE_SIZES.has(value?.paperSize) ? value.paperSize : 'Letter'
  const orientation = value?.orientation === 'landscape' ? 'landscape' : 'portrait'
  return {
    paperSize,
    orientation,
    margins: {
      top: clampMargin(value?.margins?.top),
      right: clampMargin(value?.margins?.right),
      bottom: clampMargin(value?.margins?.bottom),
      left: clampMargin(value?.margins?.left)
    }
  }
}

async function exportPdf({ html, pageSetup }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultExportName('pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null
  const win = await createRenderWindow(await inlineLocalImages(html))
  try {
    const setup = normalizePageSetup(pageSetup)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: false,
      pageSize: setup.paperSize,
      landscape: setup.orientation === 'landscape',
      margins: setup.margins
    })
    await fsp.writeFile(result.filePath, pdf)
    return { filePath: result.filePath }
  } finally {
    win.destroy()
  }
}

async function exportImage({ html }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultExportName('png'),
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return null
  const win = await createRenderWindow(await inlineLocalImages(html))
  try {
    const size = await win.webContents.executeJavaScript(`(() => ({width: Math.min(1600, Math.max(800, document.documentElement.scrollWidth)), height: Math.min(30000, Math.max(900, document.documentElement.scrollHeight))}))()`)
    win.setContentSize(size.width, size.height)
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size.width, height: size.height })
    await fsp.writeFile(result.filePath, image.toPNG())
    return { filePath: result.filePath }
  } finally {
    win.destroy()
  }
}

async function printHtml({ html, pageSetup }) {
  const win = await createRenderWindow(await inlineLocalImages(html))
  try {
    const setup = normalizePageSetup(pageSetup)
    const toPixels = (inches) => Math.round(inches * 96)
    return await new Promise((resolve) => {
      win.webContents.print({
        printBackground: true,
        pageSize: setup.paperSize,
        landscape: setup.orientation === 'landscape',
        margins: {
          marginType: 'custom',
          top: toPixels(setup.margins.top),
          right: toPixels(setup.margins.right),
          bottom: toPixels(setup.margins.bottom),
          left: toPixels(setup.margins.left)
        }
      }, (success, failureReason) => {
        resolve(success ? { ok: true } : { ok: false, error: failureReason || 'Print was cancelled.' })
      })
    })
  } finally {
    win.destroy()
  }
}

async function exportWithPandoc({ markdown, format }) {
  if (!hasPandoc()) {
    return { ok: false, error: 'Pandoc is not installed. Install Pandoc 2.0+ to enable this export format.' }
  }
  const formats = {
    docx: { ext: 'docx', to: 'docx', label: 'Word' },
    odt: { ext: 'odt', to: 'odt', label: 'OpenDocument' },
    rtf: { ext: 'rtf', to: 'rtf', label: 'RTF' },
    epub: { ext: 'epub', to: 'epub', label: 'EPUB' },
    latex: { ext: 'tex', to: 'latex', label: 'LaTeX' },
    mediawiki: { ext: 'mediawiki', to: 'mediawiki', label: 'MediaWiki' }
  }
  const spec = formats[format]
  if (!spec) throw new Error(`Unsupported export format: ${format}`)
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultExportName(spec.ext),
    filters: [{ name: spec.label, extensions: [spec.ext] }]
  })
  if (result.canceled || !result.filePath) return null

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'typeopen-export-'))
  const sourcePath = path.join(tempDir, 'source.md')
  try {
    await fsp.writeFile(sourcePath, markdown, 'utf8')
    await runPandoc([sourcePath, '--from=gfm+yaml_metadata_block', `--to=${spec.to}`, '--output', result.filePath])
    return { ok: true, filePath: result.filePath }
  } catch (error) {
    return { ok: false, error: error.stderr || error.message }
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true })
  }
}

async function saveImageAsset({ name, dataUrl }) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Image payload is not a supported data URL.')
  const extensionByMime = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif'
  }
  const ext = extensionByMime[match[1]] || '.png'
  const baseDir = documentBaseDirectory()
  if (!baseDir) return { url: dataUrl }
  const assetsDir = path.join(baseDir, 'assets')
  await fsp.mkdir(assetsDir, { recursive: true })
  const assetsStat = await fsp.lstat(assetsDir)
  if (!assetsStat.isDirectory() || assetsStat.isSymbolicLink() || !await isRealPathInsideOrEqual(assetsDir, baseDir)) {
    throw new Error('The document assets directory is not a safe local directory.')
  }
  const stem = path.basename(name || `image-${Date.now()}`, path.extname(name || ''))
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || `image-${Date.now()}`
  let fileName = `${stem}${ext}`
  let destination = path.join(assetsDir, fileName)
  let counter = 2
  while (fs.existsSync(destination)) {
    fileName = `${stem}-${counter}${ext}`
    destination = path.join(assetsDir, fileName)
    counter += 1
  }
  await fsp.writeFile(destination, Buffer.from(match[2], 'base64'))
  return { url: `assets/${fileName}` }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: 'About TypeOpen', click: () => sendCommand('about') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('preferences') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendCommand('new') },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => sendCommand('new-tab') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendCommand('open-folder') },
        ...(isMac ? [{ label: 'Open Recent', role: 'recentDocuments', submenu: [{ label: 'Clear Recent', role: 'clearRecentDocuments' }] }] : []),
        { label: 'Reopen Closed File', click: () => sendCommand('reopen-closed-file') },
        { label: 'Open Quickly', click: () => sendCommand('open-quickly') },
        { label: 'Open File Location', click: () => { if (documentState.filePath) shell.showItemInFolder(documentState.filePath) } },
        { label: 'Reveal in File Tree', click: () => sendCommand('reveal-file-tree') },
        { label: 'Import…', click: () => sendCommand('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendCommand('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand('save-as') },
        { label: 'Save All', click: () => sendCommand('save-all') },
        { label: 'Revert to Saved', click: () => sendCommand('revert') },
        { type: 'separator' },
        { label: 'Duplicate', click: () => sendCommand('duplicate-document') },
        { label: 'Rename', click: () => sendCommand('rename-document') },
        { label: 'Move To', click: () => sendCommand('move-document') },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            { label: 'PDF…', click: () => sendCommand('export', 'pdf') },
            { label: 'HTML…', click: () => sendCommand('export', 'html') },
            { label: 'HTML (without styles)…', click: () => sendCommand('export', 'html-plain') },
            { label: 'Image (PNG)…', click: () => sendCommand('export', 'image') },
            { type: 'separator' },
            { label: 'Word (.docx)…', click: () => sendCommand('export', 'docx') },
            { label: 'OpenDocument (.odt)…', click: () => sendCommand('export', 'odt') },
            { label: 'RTF…', click: () => sendCommand('export', 'rtf') },
            { label: 'EPUB…', click: () => sendCommand('export', 'epub') },
            { label: 'LaTeX…', click: () => sendCommand('export', 'latex') },
            { label: 'MediaWiki…', click: () => sendCommand('export', 'mediawiki') }
          ]
        },
        { type: 'separator' },
        { label: 'Page Setup…', click: () => sendCommand('page-setup') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendCommand('print') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => sendCommand('close-tab') },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => mainWindow?.close() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { label: 'Paste as Plain Text', accelerator: 'CmdOrCtrl+Shift+V', click: () => sendCommand('paste-plain') },
        { label: 'Copy as Markdown', accelerator: 'CmdOrCtrl+Shift+C', click: () => sendCommand('copy-markdown') },
        { label: 'Copy as HTML', click: () => sendCommand('copy-html') },
        { type: 'separator' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendCommand('find') },
        { label: 'Find Next', accelerator: 'CmdOrCtrl+G', click: () => sendCommand('find-next') },
        { label: 'Find Previous', accelerator: 'CmdOrCtrl+Shift+G', click: () => sendCommand('find-previous') },
        { label: 'Replace…', accelerator: isMac ? 'Cmd+Alt+F' : 'Ctrl+H', click: () => sendCommand('replace') },
        { label: 'Replace Next', click: () => sendCommand('replace-next') },
        { type: 'separator' },
        { label: 'Search in Folder…', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendCommand('search-folder') },
        ...(isMac ? [
          { type: 'separator' },
          {
            label: 'Substitutions',
            submenu: [
              { role: 'showSubstitutions' },
              { type: 'separator' },
              { role: 'toggleSmartQuotes' },
              { role: 'toggleSmartDashes' },
              { role: 'toggleTextReplacement' }
            ]
          },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [])
      ]
    },
    {
      label: 'Paragraph',
      submenu: [
        { label: 'Paragraph', accelerator: 'CmdOrCtrl+0', click: () => sendCommand('insert', 'paragraph') },
        ...[1, 2, 3, 4, 5, 6].map((level) => ({ label: `Heading ${level}`, accelerator: `CmdOrCtrl+${level}`, click: () => sendCommand('insert', `h${level}`) })),
        { label: 'Increase Heading Level', click: () => sendCommand('heading-level', 'increase') },
        { label: 'Decrease Heading Level', click: () => sendCommand('heading-level', 'decrease') },
        { type: 'separator' },
        { label: 'Block Quote', accelerator: 'CmdOrCtrl+Shift+Q', click: () => sendCommand('insert', 'quote') },
        { label: 'Code Fence', accelerator: 'CmdOrCtrl+Shift+K', click: () => sendCommand('insert', 'code-fence') },
        { label: 'Math Block', click: () => sendCommand('insert', 'math-block') },
        { label: 'Table…', click: () => sendCommand('insert', 'table') },
        { type: 'separator' },
        { label: 'Ordered List', click: () => sendCommand('insert', 'ordered-list') },
        { label: 'Unordered List', click: () => sendCommand('insert', 'unordered-list') },
        { label: 'Task List', click: () => sendCommand('insert', 'task-list') },
        { label: 'Task Status', click: () => sendCommand('task-status') },
        { label: 'Indent', click: () => sendCommand('indent') },
        { label: 'Outdent', click: () => sendCommand('outdent') },
        { label: 'Footnote', click: () => sendCommand('insert', 'footnote') },
        { label: 'Table of Contents', click: () => sendCommand('insert', 'toc') },
        { label: 'YAML Front Matter', click: () => sendCommand('insert', 'frontmatter') }
      ]
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Strong', accelerator: 'CmdOrCtrl+B', click: () => sendCommand('format', 'bold') },
        { label: 'Emphasis', accelerator: 'CmdOrCtrl+I', click: () => sendCommand('format', 'italic') },
        { label: 'Underline', accelerator: 'CmdOrCtrl+U', click: () => sendCommand('format', 'underline') },
        { label: 'Inline Code', accelerator: 'CmdOrCtrl+Shift+`', click: () => sendCommand('format', 'code') },
        { label: 'Strike', click: () => sendCommand('format', 'strike') },
        { label: 'Highlight', click: () => sendCommand('format', 'highlight') },
        { label: 'Superscript', click: () => sendCommand('format', 'superscript') },
        { label: 'Subscript', click: () => sendCommand('format', 'subscript') },
        { label: 'Comment', click: () => sendCommand('format', 'comment') },
        { label: 'Inline Math', click: () => sendCommand('insert', 'inline-math') },
        { type: 'separator' },
        { label: 'Link…', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('insert', 'link') },
        { label: 'Image…', click: () => sendCommand('insert', 'image') },
        { label: 'Horizontal Rule', click: () => sendCommand('insert', 'hr') },
        { type: 'separator' },
        { label: 'Clear Format', click: () => sendCommand('clear-format') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendCommand('toggle-sidebar') },
        { label: 'Outline', accelerator: isMac ? 'Cmd+Ctrl+1' : 'Ctrl+Shift+1', click: () => sendCommand('sidebar', 'outline') },
        { label: 'Articles', accelerator: isMac ? 'Cmd+Ctrl+2' : 'Ctrl+Shift+2', click: () => sendCommand('sidebar', 'articles') },
        { label: 'File Tree', accelerator: isMac ? 'Cmd+Ctrl+3' : 'Ctrl+Shift+3', click: () => sendCommand('sidebar', 'files') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => sendCommand('next-tab') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => sendCommand('previous-tab') },
        { type: 'separator' },
        { label: 'Source Code Mode', accelerator: 'CmdOrCtrl+/', click: () => sendCommand('source-mode') },
        { label: 'Read-only Mode', click: () => sendCommand('read-only-mode') },
        { label: 'Focus Mode', accelerator: 'F8', click: () => sendCommand('focus-mode') },
        { label: 'Typewriter Mode', accelerator: 'F9', click: () => sendCommand('typewriter-mode') },
        { type: 'separator' },
        { label: 'Show Status Bar', click: () => sendCommand('toggle-status-bar') },
        { label: 'Show Editor Toolbar', click: () => sendCommand('toggle-toolbar') },
        { label: 'Always on Top', type: 'checkbox', click: (item) => mainWindow?.setAlwaysOnTop(item.checked) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'TypeOpen Documentation', click: () => sendCommand('documentation') },
        { label: 'Markdown Reference', click: () => sendCommand('markdown-reference') },
        { type: 'separator' },
        { label: 'Open Source Licenses', click: () => sendCommand('licenses') }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

function installContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const items = []
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
      }
      if (items.length) items.push({ type: 'separator' })
      items.push({ label: `Learn “${params.misspelledWord}”`, click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) })
      items.push({ type: 'separator' })
    }
    if (params.isEditable) {
      items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
    } else if (params.selectionText) {
      items.push({ role: 'copy' })
    }
    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' })
      if (/^https?:/i.test(params.linkURL)) items.push({ label: 'Open Link', click: () => shell.openExternal(params.linkURL) })
      items.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'TypeOpen',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151515' : '#fbfbfb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  installContextMenu(mainWindow)
  Menu.setApplicationMenu(buildMenu())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (DEV_SERVER && url.startsWith(DEV_SERVER)) return
    event.preventDefault()
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (!forceClose && documentState.hasDirtyDocuments) {
      event.preventDefault()
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Save All', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: 'Do you want to save changes to the open documents?',
        detail: 'Unsaved changes in any open tab will be lost if you do not save them.'
      }).then(({ response }) => {
        if (response === 0) sendCommand('save-all-before-close')
        if (response === 1) {
          forceClose = true
          mainWindow.close()
        }
      })
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })

  if (DEV_SERVER) await mainWindow.loadURL(DEV_SERVER)
  else await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('typeopen:open-file', async (event) => { assertTrustedRenderer(event); return chooseOpenFile() })
ipcMain.handle('typeopen:open-folder', async (event) => { assertTrustedRenderer(event); return chooseOpenFolder() })
ipcMain.handle('typeopen:choose-theme-css', async (event) => { assertTrustedRenderer(event); return chooseThemeCss() })
ipcMain.handle('typeopen:read-file', async (event, filePath) => {
  assertTrustedRenderer(event)
  await assertReadableDocumentPath(filePath)
  const content = await readDocument(filePath)
  // Revalidate after I/O before promoting a folder-scoped path to an exact
  // document grant. This prevents a path swapped to an external symlink
  // during the read from being returned or permanently authorized.
  await assertReadableDocumentPath(filePath)
  pathGrants.grantDocument(filePath)
  app.addRecentDocument(filePath)
  return {
    filePath,
    content,
    imported: PANDOC_IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  }
})
ipcMain.handle('typeopen:list-folder', async (event, folderPath) => {
  assertTrustedRenderer(event)
  await assertListableFolderPath(folderPath)
  return { folderPath, tree: await listDirectory(folderPath) }
})
ipcMain.handle('typeopen:search-folder', async (event, payload) => {
  assertTrustedRenderer(event)
  const query = typeof payload?.query === 'string' ? payload.query : ''
  const folderPath = pathGrants.getFolder()
  if (!folderPath || !query) return { results: [], truncated: false }
  await assertListableFolderPath(folderPath)
  const results = await searchFolder(folderPath, { query, matchCase: Boolean(payload?.matchCase) }, [], folderPath)
  return { results, truncated: results.length >= GLOBAL_SEARCH_MAX_RESULTS }
})
ipcMain.handle('typeopen:save-file', async (event, payload) => { assertTrustedRenderer(event); return writeDocument(payload) })
ipcMain.handle('typeopen:save-file-as', async (event, payload) => { assertTrustedRenderer(event); return writeDocument({ ...payload, saveAs: true }) })
ipcMain.handle('typeopen:duplicate-document', async (event, payload) => { assertTrustedRenderer(event); return duplicateDocument(payload?.filePath, payload?.content) })
ipcMain.handle('typeopen:rename-document', async (event, filePath) => { assertTrustedRenderer(event); return renameDocument(filePath) })
ipcMain.handle('typeopen:move-document', async (event, filePath) => { assertTrustedRenderer(event); return moveDocument(filePath) })
ipcMain.handle('typeopen:export-html', async (_event, payload) => exportHtml(payload))
ipcMain.handle('typeopen:export-pdf', async (_event, payload) => exportPdf(payload))
ipcMain.handle('typeopen:export-image', async (_event, payload) => exportImage(payload))
ipcMain.handle('typeopen:print-html', async (_event, payload) => printHtml(payload))
ipcMain.handle('typeopen:export-pandoc', async (_event, payload) => exportWithPandoc(payload))
ipcMain.handle('typeopen:pandoc-status', async () => ({ available: hasPandoc() }))
ipcMain.handle('typeopen:save-image', async (event, payload) => { assertTrustedRenderer(event); return saveImageAsset(payload) })
ipcMain.handle('typeopen:resolve-image-preview', async (event, source) => { assertTrustedRenderer(event); return { url: await resolveImagePreview(source) } })
ipcMain.handle('typeopen:clipboard-read', () => clipboard.readText())
ipcMain.handle('typeopen:clipboard-write', (_event, text) => { clipboard.writeText(text); return true })
ipcMain.handle('typeopen:show-item', (event, filePath) => {
  assertTrustedRenderer(event)
  if (!pathGrants.canReadDocument(filePath)) throw new Error('Item path has not been granted by the user.')
  shell.showItemInFolder(filePath)
  return true
})
ipcMain.handle('typeopen:open-external', (_event, url) => {
  if (!/^https?:/i.test(String(url))) throw new Error('Only HTTP(S) external links are allowed.')
  return shell.openExternal(url)
})
ipcMain.handle('typeopen:confirm-discard', async (_event, payload) => {
  const title = typeof payload?.title === 'string' && payload.title ? payload.title : documentState.title || 'Untitled'
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Save', 'Discard Changes', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: `Save changes to “${title}” before continuing?`,
    detail: 'Unsaved changes will be lost if you discard them.'
  })
  return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel'
})
ipcMain.on('typeopen:document-state', (event, nextState) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return
  const nextFilePath = typeof nextState?.filePath === 'string' && pathGrants.isDocumentGranted(nextState.filePath) ? path.resolve(nextState.filePath) : null
  const nextFolderPath = typeof nextState?.folderPath === 'string' && pathGrants.isCurrentFolder(nextState.folderPath) ? path.resolve(nextState.folderPath) : null
  documentState = {
    filePath: nextFilePath,
    folderPath: nextFolderPath,
    dirty: Boolean(nextState?.dirty),
    hasDirtyDocuments: Boolean(nextState?.hasDirtyDocuments),
    title: typeof nextState?.title === 'string' && nextState.title ? nextState.title.slice(0, 512) : 'Untitled'
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setDocumentEdited(Boolean(documentState.dirty))
    mainWindow.setRepresentedFilename(documentState.filePath || '')
    mainWindow.setTitle(`${documentState.title || 'Untitled'}${documentState.dirty ? ' — Edited' : ''} — TypeOpen`)
  }
})

ipcMain.on('typeopen:close-after-save', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    forceClose = true
    mainWindow.close()
  }
})

ipcMain.on('typeopen:renderer-ready', () => {
  if (pendingOpenPath) {
    sendCommand('open-path', pendingOpenPath)
    pendingOpenPath = null
  }
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const candidate = argv.find((arg) => isEditableDocument(arg) && fs.existsSync(arg))
    if (candidate) {
      grantOpenedDocument(candidate)
      sendCommand('open-path', candidate)
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    grantOpenedDocument(filePath)
    if (mainWindow) sendCommand('open-path', filePath)
    else pendingOpenPath = filePath
  })

  app.whenReady().then(async () => {
    app.setName('TypeOpen')
    if (process.platform === 'darwin') app.setAboutPanelOptions({ applicationName: 'TypeOpen', applicationVersion: app.getVersion(), copyright: '© 2026 TriHerm Labs contributors' })
    await createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
