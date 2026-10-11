const path = require('node:path')
const { isTextBundlePath } = require('./textbundle.cjs')

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

function isEditableDocument(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false
  const ext = path.extname(filePath).toLowerCase()
  return isTextBundlePath(filePath) || MARKDOWN_EXTENSIONS.has(ext) || PANDOC_IMPORT_EXTENSIONS.has(ext)
}

function isSessionDocument(filePath) {
  if (typeof filePath !== 'string' || !filePath) return false
  return isTextBundlePath(filePath) || MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

module.exports = {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MARKDOWN_EXTENSIONS,
  PANDOC_IMPORT_EXTENSIONS,
  isEditableDocument,
  isSessionDocument
}
