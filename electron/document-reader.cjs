const path = require('node:path')
const { isEditableDocument, PANDOC_IMPORT_EXTENSIONS } = require('./document-types.cjs')
const { isInsideOrEqual, pathSnapshot, samePathSnapshot } = require('./path-grants.cjs')

async function readAndGrantDocument({
  filePath,
  pathGrants,
  assertReadableDocumentPath,
  readDocumentFromSnapshot,
  noteRecent = () => undefined
}) {
  if (!isEditableDocument(filePath)) throw new Error('Choose a supported document type.')
  await assertReadableDocumentPath(filePath)
  const hadExactGrant = pathGrants.isDocumentGranted(filePath)
  const authorizedFolderRealPath = hadExactGrant ? null : pathGrants.getFolderRealPath()
  const before = pathSnapshot(filePath, { rejectSymbolicLink: true })
  if (!before) throw new Error('Document path changed before it could be read safely.')
  if (!hadExactGrant && (!authorizedFolderRealPath || !isInsideOrEqual(before.realPath, authorizedFolderRealPath))) {
    throw new Error('Document resolved outside the folder authorized by the user.')
  }
  const content = await readDocumentFromSnapshot(filePath, before)
  await assertReadableDocumentPath(filePath)
  const after = pathSnapshot(filePath, { rejectSymbolicLink: true })
  if (!samePathSnapshot(before, after)) throw new Error('Document path changed while it was being read.')
  if (!hadExactGrant && pathGrants.getFolderRealPath() !== authorizedFolderRealPath) {
    throw new Error('Authorized folder changed while the document was being read.')
  }
  pathGrants.grantDocument(filePath, before)
  noteRecent(filePath)
  return {
    filePath,
    content,
    imported: PANDOC_IMPORT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  }
}

module.exports = { readAndGrantDocument }
