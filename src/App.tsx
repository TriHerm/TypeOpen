import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, FileText, FolderOpen, PanelLeft, Plus, Save, Search, X } from 'lucide-react'
import { MarkdownEditor, type MarkdownEditorHandle } from './editor/MarkdownEditor'
import { FindBar } from './components/FindBar'
import { GlobalSearch, type GlobalSearchResult } from './components/GlobalSearch'
import { PreferencesDialog, type TypeOpenPreferences } from './components/PreferencesDialog'
import { DEFAULT_PAGE_SETUP, PageSetupDialog, type PageSetupState } from './components/PageSetupDialog'
import { QuickOpen } from './components/QuickOpen'
import { Sidebar, type SidebarTab } from './components/Sidebar'
import { containsHtmlCommentOutsideFences, createExportHtml, documentTitle, extractOutline, findMatches, getDocumentStats, replaceAllLiteral, type OutlineItem } from './lib/markdown'

const EMPTY_DOCUMENT = ''
const PREF_KEY = 'typeopen.preferences.v1'
const PAGE_SETUP_KEY = 'typeopen.page-setup.v1'

const DEFAULT_PREFS: TypeOpenPreferences = {
  theme: 'system',
  customThemeName: null,
  customThemeCss: '',
  fontSize: 17,
  contentWidth: 780,
  spellCheck: true,
  autosave: false,
  statusBar: true,
  toolbar: false,
  sidebarDefault: true
}

function loadPageSetup(): PageSetupState {
  try {
    const raw = localStorage.getItem(PAGE_SETUP_KEY)
    return raw ? { ...DEFAULT_PAGE_SETUP, ...JSON.parse(raw), margins: { ...DEFAULT_PAGE_SETUP.margins, ...JSON.parse(raw).margins } } : DEFAULT_PAGE_SETUP
  } catch {
    return DEFAULT_PAGE_SETUP
  }
}

function loadPreferences(): TypeOpenPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

function basename(filePath: string | null): string {
  if (!filePath) return 'Untitled'
  return filePath.split(/[\\/]/).pop() || 'Untitled'
}

function extensionless(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, '')
}

interface OpenDocument {
  id: string
  filePath: string | null
  importedFrom: string | null
  markdown: string
  savedMarkdown: string
}

function createBlankDocument(): OpenDocument {
  return {
    id: crypto.randomUUID(),
    filePath: null,
    importedFrom: null,
    markdown: EMPTY_DOCUMENT,
    savedMarkdown: EMPTY_DOCUMENT
  }
}

function isDocumentDirty(document: OpenDocument): boolean {
  return document.markdown !== document.savedMarkdown || document.importedFrom !== null
}

function documentDisplayTitle(document: OpenDocument): string {
  if (document.filePath) return basename(document.filePath)
  if (document.importedFrom) return `${extensionless(document.importedFrom)}.md`
  return documentTitle(document.markdown, 'Untitled')
}

function documentSuggestedName(document: OpenDocument): string {
  if (document.filePath) return basename(document.filePath)
  if (document.importedFrom) return `${extensionless(document.importedFrom)}.md`
  const title = documentTitle(document.markdown, 'Untitled')
  return /\.[a-z0-9]+$/i.test(title) ? title : `${title}.md`
}

function treeContainsPath(nodes: TypeOpenTreeNode[], targetPath: string): boolean {
  return nodes.some((node) => node.path === targetPath || (node.children ? treeContainsPath(node.children, targetPath) : false))
}

export default function App() {
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const autosaveTimer = useRef<number | null>(null)
  const [documents, setDocumentsState] = useState<OpenDocument[]>(() => [createBlankDocument()])
  const [activeDocumentId, setActiveDocumentIdState] = useState(() => documents[0].id)
  const documentsRef = useRef(documents)
  const activeDocumentIdRef = useRef(activeDocumentId)
  const closedDocumentsRef = useRef<OpenDocument[]>([])
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<TypeOpenTreeNode[]>([])
  const [sidebarVisible, setSidebarVisible] = useState(() => loadPreferences().sidebarDefault)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('outline')
  const [sourceMode, setSourceMode] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(false)
  const [findVisible, setFindVisible] = useState(false)
  const [replaceVisible, setReplaceVisible] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [currentMatch, setCurrentMatch] = useState(-1)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [fileReveal, setFileReveal] = useState<{ path: string; request: number } | null>(null)
  const [preferencesVisible, setPreferencesVisible] = useState(false)
  const [preferences, setPreferences] = useState<TypeOpenPreferences>(() => loadPreferences())
  const [pageSetupVisible, setPageSetupVisible] = useState(false)
  const [pageSetup, setPageSetup] = useState<PageSetupState>(() => loadPageSetup())
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? documents[0]
  const markdown = activeDocument?.markdown ?? EMPTY_DOCUMENT
  const filePath = activeDocument?.filePath ?? null
  const dirty = activeDocument ? isDocumentDirty(activeDocument) : false
  const hasDirtyDocuments = documents.some(isDocumentDirty)
  const outline = useMemo(() => extractOutline(markdown), [markdown])
  const stats = useMemo(() => getDocumentStats(markdown), [markdown])
  const matches = useMemo(() => findMatches(markdown, findQuery, matchCase), [markdown, findQuery, matchCase])
  const title = activeDocument ? documentDisplayTitle(activeDocument) : 'Untitled'

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), 2600)
  }, [])

  const replaceDocuments = useCallback((updater: (current: OpenDocument[]) => OpenDocument[]) => {
    const next = updater(documentsRef.current)
    documentsRef.current = next
    setDocumentsState(next)
    return next
  }, [])

  const setActiveDocumentId = useCallback((id: string) => {
    activeDocumentIdRef.current = id
    setActiveDocumentIdState(id)
  }, [])

  const updateDocument = useCallback((id: string, updater: (document: OpenDocument) => OpenDocument) => {
    replaceDocuments((current) => current.map((document) => document.id === id ? updater(document) : document))
  }, [replaceDocuments])

  const rememberClosedDocument = useCallback((document: OpenDocument) => {
    const source = document.filePath ?? document.importedFrom
    if (!source) return
    closedDocumentsRef.current = [
      { ...document },
      ...closedDocumentsRef.current.filter((candidate) => (candidate.filePath ?? candidate.importedFrom) !== source)
    ].slice(0, 20)
  }, [])

  const flushActiveEditor = useCallback(() => {
    const id = activeDocumentIdRef.current
    const latest = editorRef.current?.getMarkdown()
    if (latest === undefined) return
    updateDocument(id, (document) => document.markdown === latest ? document : { ...document, markdown: latest })
  }, [updateDocument])

  const announceDocumentState = useCallback((document: OpenDocument, collection = documentsRef.current) => {
    window.typeopen.setDocumentState({
      filePath: document.filePath,
      folderPath,
      dirty: isDocumentDirty(document),
      hasDirtyDocuments: collection.some(isDocumentDirty),
      title: documentDisplayTitle(document)
    })
  }, [folderPath])

  const activateDocument = useCallback((id: string) => {
    if (id === activeDocumentIdRef.current) return
    flushActiveEditor()
    const target = documentsRef.current.find((document) => document.id === id)
    if (!target) return
    announceDocumentState(target)
    setActiveDocumentId(id)
    setCurrentMatch(-1)
  }, [announceDocumentState, flushActiveEditor, setActiveDocumentId])

  const refreshFolder = useCallback(async (path = folderPath) => {
    if (!path) return
    const result = await window.typeopen.invoke<{ folderPath: string; tree: TypeOpenTreeNode[] }>('typeopen:list-folder', path)
    setFileTree(result.tree)
  }, [folderPath])

  const loadFile = useCallback(async (path: string, content?: string, importedHint?: boolean) => {
    const existing = documentsRef.current.find((document) => document.filePath === path || document.importedFrom === path)
    if (existing) {
      activateDocument(existing.id)
      return true
    }
    setBusy(true)
    try {
      const result = content === undefined
        ? await window.typeopen.invoke<{ filePath: string; content: string; imported?: boolean }>('typeopen:read-file', path)
        : { filePath: path, content, imported: importedHint }
      const imported = Boolean(result.imported)
      flushActiveEditor()
      const document: OpenDocument = {
        id: crypto.randomUUID(),
        filePath: imported ? null : result.filePath,
        importedFrom: imported ? result.filePath : null,
        markdown: result.content,
        savedMarkdown: result.content
      }
      const nextDocuments = replaceDocuments((current) => [...current, document])
      announceDocumentState(document, nextDocuments)
      setActiveDocumentId(document.id)
      setCurrentMatch(-1)
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setBusy(false)
    }
  }, [activateDocument, announceDocumentState, flushActiveEditor, replaceDocuments, setActiveDocumentId, showToast])

  const openFile = useCallback(async () => {
    const result = await window.typeopen.invoke<{ filePath: string; content?: string; imported?: boolean } | null>('typeopen:open-file')
    if (result) await loadFile(result.filePath, result.content, result.imported)
  }, [loadFile])

  const openFolder = useCallback(async () => {
    const result = await window.typeopen.invoke<{ folderPath: string; tree: TypeOpenTreeNode[] } | null>('typeopen:open-folder')
    if (!result) return
    setFolderPath(result.folderPath)
    setFileTree(result.tree)
    setSidebarVisible(true)
    setSidebarTab('files')
  }, [])

  const saveDocument = useCallback(async (id: string, saveAs = false, showSavedToast = true, manageBusy = true) => {
    if (manageBusy) setBusy(true)
    try {
      if (id === activeDocumentIdRef.current) flushActiveEditor()
      const document = documentsRef.current.find((candidate) => candidate.id === id)
      if (!document) return false
      const latest = document.markdown
      const channel = saveAs ? 'typeopen:save-file-as' : 'typeopen:save-file'
      const result = await window.typeopen.invoke<{ filePath: string } | null>(channel, {
        filePath: document.filePath,
        content: latest,
        suggestedName: documentSuggestedName(document)
      })
      if (!result) return false
      updateDocument(id, (current) => ({
        ...current,
        filePath: result.filePath,
        importedFrom: null,
        markdown: latest,
        savedMarkdown: latest
      }))
      if (folderPath) await refreshFolder(folderPath).catch(() => undefined)
      if (showSavedToast) showToast('Saved')
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      if (manageBusy) setBusy(false)
    }
  }, [flushActiveEditor, folderPath, refreshFolder, showToast, updateDocument])

  const save = useCallback((saveAs = false) => saveDocument(activeDocumentIdRef.current, saveAs), [saveDocument])

  const newDocument = useCallback(() => {
    flushActiveEditor()
    const document = createBlankDocument()
    const nextDocuments = replaceDocuments((current) => [...current, document])
    announceDocumentState(document, nextDocuments)
    setActiveDocumentId(document.id)
    setCurrentMatch(-1)
  }, [announceDocumentState, flushActiveEditor, replaceDocuments, setActiveDocumentId])

  const closeDocument = useCallback(async (id: string) => {
    flushActiveEditor()
    const current = documentsRef.current
    const index = current.findIndex((document) => document.id === id)
    if (index < 0) return false
    let document = current[index]

    if (isDocumentDirty(document)) {
      const action = await window.typeopen.invoke<'save' | 'discard' | 'cancel'>('typeopen:confirm-discard', { title: documentDisplayTitle(document) })
      if (action === 'cancel') return false
      if (action === 'save' && !await saveDocument(id, false, false)) return false
      document = documentsRef.current.find((candidate) => candidate.id === id) ?? document
    }

    rememberClosedDocument(document)

    const latest = documentsRef.current
    const latestIndex = latest.findIndex((candidate) => candidate.id === id)
    if (latestIndex < 0) return true
    const remaining = latest.filter((candidate) => candidate.id !== id)
    if (remaining.length === 0) {
      const replacement = createBlankDocument()
      documentsRef.current = [replacement]
      setDocumentsState([replacement])
      announceDocumentState(replacement, [replacement])
      setActiveDocumentId(replacement.id)
      setCurrentMatch(-1)
      return true
    }

    replaceDocuments(() => remaining)
    if (activeDocumentIdRef.current === id) {
      const next = remaining[Math.min(latestIndex, remaining.length - 1)]
      announceDocumentState(next, remaining)
      setActiveDocumentId(next.id)
      setCurrentMatch(-1)
    }
    return true
  }, [announceDocumentState, flushActiveEditor, rememberClosedDocument, replaceDocuments, saveDocument, setActiveDocumentId])

  const reopenClosedFile = useCallback(async () => {
    const document = closedDocumentsRef.current.shift()
    if (!document) {
      showToast('No recently closed file')
      return
    }
    const source = document.filePath ?? document.importedFrom
    if (!source || await loadFile(source)) return
    closedDocumentsRef.current.unshift(document)
  }, [loadFile, showToast])

  const navigateDocument = useCallback((delta: number) => {
    const current = documentsRef.current
    if (current.length < 2) return
    const index = current.findIndex((document) => document.id === activeDocumentIdRef.current)
    const nextIndex = ((index < 0 ? 0 : index) + delta + current.length) % current.length
    activateDocument(current[nextIndex].id)
  }, [activateDocument])

  const saveAllDocuments = useCallback(async (closeAfter = false) => {
    flushActiveEditor()
    setBusy(true)
    try {
      const dirtyIds = documentsRef.current.filter(isDocumentDirty).map((document) => document.id)
      for (const id of dirtyIds) {
        if (!await saveDocument(id, false, false, false)) return false
      }
      if (closeAfter) window.typeopen.closeAfterSave()
      else showToast(dirtyIds.length ? 'Saved all documents' : 'All documents are saved')
      return true
    } finally {
      setBusy(false)
    }
  }, [flushActiveEditor, saveDocument, showToast])

  const revealCurrentFileInTree = useCallback(() => {
    if (!filePath) {
      showToast('Save the document before revealing it in the file tree')
      return
    }
    if (!treeContainsPath(fileTree, filePath)) {
      showToast('Current document is not inside the open folder')
      return
    }
    setSidebarVisible(true)
    setSidebarTab('files')
    setFileReveal((current) => ({ path: filePath, request: (current?.request ?? 0) + 1 }))
  }, [filePath, fileTree, showToast])

  const updateOpenDocumentPath = useCallback((previousPath: string, nextPath: string) => {
    const nextDocuments = replaceDocuments((current) => current.map((document) => (
      document.filePath === previousPath ? { ...document, filePath: nextPath } : document
    )))
    const active = nextDocuments.find((document) => document.id === activeDocumentIdRef.current)
    if (active) announceDocumentState(active, nextDocuments)
    setFileReveal((current) => current?.path === previousPath ? { ...current, path: nextPath } : current)
  }, [announceDocumentState, replaceDocuments])

  const duplicateActiveDocument = useCallback(async () => {
    flushActiveEditor()
    const document = documentsRef.current.find((candidate) => candidate.id === activeDocumentIdRef.current)
    if (!document?.filePath) {
      showToast('Save the document before duplicating it')
      return
    }
    try {
      const result = await window.typeopen.invoke<{ filePath: string } | null>('typeopen:duplicate-document', { filePath: document.filePath, content: document.markdown })
      if (!result) return
      if (folderPath) await refreshFolder(folderPath).catch(() => undefined)
      await loadFile(result.filePath)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }, [flushActiveEditor, folderPath, loadFile, refreshFolder, showToast])

  const relocateActiveDocument = useCallback(async (operation: 'rename' | 'move') => {
    flushActiveEditor()
    const document = documentsRef.current.find((candidate) => candidate.id === activeDocumentIdRef.current)
    if (!document?.filePath) {
      showToast(`Save the document before you ${operation} it`)
      return
    }
    try {
      const channel = operation === 'rename' ? 'typeopen:rename-document' : 'typeopen:move-document'
      const result = await window.typeopen.invoke<{ filePath: string } | null>(channel, document.filePath)
      if (!result || result.filePath === document.filePath) return
      updateOpenDocumentPath(document.filePath, result.filePath)
      if (folderPath) await refreshFolder(folderPath).catch(() => undefined)
      showToast(operation === 'rename' ? 'Renamed document' : 'Moved document')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }, [flushActiveEditor, folderPath, refreshFolder, showToast, updateOpenDocumentPath])

  const revertActiveDocument = useCallback(async () => {
    flushActiveEditor()
    const id = activeDocumentIdRef.current
    const document = documentsRef.current.find((candidate) => candidate.id === id)
    if (!document?.filePath) return
    if (isDocumentDirty(document)) {
      const action = await window.typeopen.invoke<'save' | 'discard' | 'cancel'>('typeopen:confirm-discard', { title: documentDisplayTitle(document) })
      if (action === 'cancel') return
      if (action === 'save' && !await saveDocument(id, false, false)) return
    }
    setBusy(true)
    try {
      const result = await window.typeopen.invoke<{ filePath: string; content: string; imported?: boolean }>('typeopen:read-file', document.filePath)
      updateDocument(id, (current) => ({ ...current, markdown: result.content, savedMarkdown: result.content, importedFrom: null }))
      editorRef.current?.setMarkdown(result.content)
      setCurrentMatch(-1)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [flushActiveEditor, saveDocument, showToast, updateDocument])

  const uploadImage = useCallback(async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
    const result = await window.typeopen.invoke<{ url: string }>('typeopen:save-image', { name: file.name, dataUrl })
    return result.url
  }, [])

  const previewImage = useCallback(async (source: string) => {
    const result = await window.typeopen.invoke<{ url: string }>('typeopen:resolve-image-preview', source)
    return result.url
  }, [])

  const createOutputHtml = useCallback(async () => {
    const latest = editorRef.current?.getMarkdown() ?? markdown
    return createExportHtml(latest, {
      title: filePath ? extensionless(filePath) : documentTitle(latest),
      includeOutline: false,
      theme: preferences.theme === 'dark' ? 'dark' : 'light',
      maxWidth: preferences.contentWidth
    })
  }, [filePath, markdown, preferences.contentWidth, preferences.theme])

  const exportDocument = useCallback(async (format: string) => {
    setBusy(true)
    try {
      const latest = editorRef.current?.getMarkdown() ?? markdown
      if (format === 'pdf' || format === 'html' || format === 'html-plain' || format === 'image') {
        const html = await createOutputHtml()
        const channel = format === 'pdf' ? 'typeopen:export-pdf' : format === 'image' ? 'typeopen:export-image' : 'typeopen:export-html'
        const payload = format.startsWith('html') ? { html, styled: format === 'html' } : format === 'pdf' ? { html, pageSetup } : { html }
        const result = await window.typeopen.invoke<{ filePath: string } | null>(channel, payload)
        if (result) showToast(`Exported ${basename(result.filePath)}`)
        return
      }
      const result = await window.typeopen.invoke<{ ok: boolean; filePath?: string; error?: string } | null>('typeopen:export-pandoc', { markdown: latest, format })
      if (result?.ok && result.filePath) showToast(`Exported ${basename(result.filePath)}`)
      else if (result?.error) showToast(result.error)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [createOutputHtml, markdown, pageSetup, showToast])

  const printDocument = useCallback(async () => {
    setBusy(true)
    try {
      const html = await createOutputHtml()
      const result = await window.typeopen.invoke<{ ok: boolean; error?: string }>('typeopen:print-html', { html, pageSetup })
      if (!result.ok && result.error) showToast(result.error)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [createOutputHtml, pageSetup, showToast])

  const chooseCustomTheme = useCallback(async () => {
    try {
      const result = await window.typeopen.invoke<{ name: string; css: string } | null>('typeopen:choose-theme-css')
      if (result) setPreferences((current) => ({ ...current, customThemeName: result.name, customThemeCss: result.css }))
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }, [showToast])

  const richCommentsRequireSource = useMemo(() => containsHtmlCommentOutsideFences(markdown), [markdown])

  const toggleSourceMode = useCallback(() => {
    if (sourceMode && richCommentsRequireSource) {
      showToast('HTML comments are source-mode only so they are not lost during rich editing')
      return
    }
    setSourceMode((value) => !value)
  }, [richCommentsRequireSource, showToast, sourceMode])

  const wrapSelection = useCallback((before: string, after = before) => {
    const selected = editorRef.current?.getSelectionMarkdown() ?? ''
    editorRef.current?.insertMarkdown(`${before}${selected || 'text'}${after}`)
    editorRef.current?.focus()
  }, [])

  const handleFormat = useCallback((name: string) => {
    if (name === 'comment') {
      if (!sourceMode) setSourceMode(true)
      showToast('HTML comments are preserved in Source mode; rich comment editing is not available yet')
      return
    }
    if (name === 'highlight' || name === 'superscript' || name === 'subscript') {
      if (!editorRef.current?.toggleTextFormat(name)) showToast('This format is available for a rich-text selection')
      return
    }
    const pairs: Record<string, [string, string]> = {
      bold: ['**', '**'], italic: ['*', '*'], underline: ['<u>', '</u>'], code: ['`', '`'], strike: ['~~', '~~']
    }
    if (pairs[name]) wrapSelection(...pairs[name])
  }, [showToast, sourceMode, wrapSelection])

  const insertSnippet = useCallback((kind: string) => {
    const snippets: Record<string, string> = {
      paragraph: '\n', h1: '# Heading', h2: '## Heading', h3: '### Heading', h4: '#### Heading', h5: '##### Heading', h6: '###### Heading',
      quote: '> Quote', 'code-fence': '```text\ncode\n```', 'math-block': '$$\nE = mc^2\n$$', 'ordered-list': '1. Item', 'unordered-list': '- Item', 'task-list': '- [ ] Task',
      table: '| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |', toc: '\n\n[TOC]\n\n', frontmatter: '---\ntitle: Untitled\n---\n', hr: '---',
      link: '[link](https://example.com)', image: '![alt text](assets/image.png)', 'inline-math': '$E = mc^2$', footnote: 'Text[^1]\n\n[^1]: Footnote'
    }
    const snippet = snippets[kind]
    if (snippet !== undefined) {
      editorRef.current?.insertMarkdown(snippet)
      editorRef.current?.focus()
    }
  }, [])

  const navigateMatch = useCallback((delta: number) => {
    if (!matches.length) return
    setCurrentMatch((index) => {
      const next = index < 0
        ? (delta >= 0 ? 0 : matches.length - 1)
        : (index + delta + matches.length) % matches.length
      queueMicrotask(() => {
        window.find(findQuery, matchCase, delta < 0, true, false, false, false)
      })
      return next
    })
  }, [findQuery, matchCase, matches.length])

  const replaceAll = useCallback(() => {
    const result = replaceAllLiteral(markdown, findQuery, replacement, matchCase)
    if (result.count) {
      updateDocument(activeDocumentIdRef.current, (document) => ({ ...document, markdown: result.value }))
      editorRef.current?.setMarkdown(result.value)
      showToast(`Replaced ${result.count} occurrence${result.count === 1 ? '' : 's'}`)
    }
  }, [findQuery, markdown, matchCase, replacement, showToast, updateDocument])

  const replaceOne = useCallback(() => {
    if (!findQuery || !matches.length) return
    const matchIndex = currentMatch < 0 ? 0 : Math.min(currentMatch, matches.length - 1)
    const index = matches[matchIndex]
    const next = markdown.slice(0, index) + replacement + markdown.slice(index + findQuery.length)
    updateDocument(activeDocumentIdRef.current, (document) => ({ ...document, markdown: next }))
    editorRef.current?.setMarkdown(next)
    setCurrentMatch(-1)
  }, [currentMatch, findQuery, markdown, matches, replacement, updateDocument])

  const scrollToHeading = useCallback((item: OutlineItem) => {
    const headings = document.querySelectorAll('.typeopen-editor-content h1,.typeopen-editor-content h2,.typeopen-editor-content h3,.typeopen-editor-content h4,.typeopen-editor-content h5,.typeopen-editor-content h6')
    const index = outline.findIndex((candidate) => candidate.slug === item.slug)
    headings[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [outline])

  const openGlobalSearchResult = useCallback(async (result: GlobalSearchResult) => {
    if (await loadFile(result.filePath)) setGlobalSearchVisible(false)
  }, [loadFile])

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(preferences))
    const root = document.documentElement
    root.dataset.theme = preferences.theme
    root.style.setProperty('--editor-font-size', `${preferences.fontSize}px`)
    root.style.setProperty('--content-width', `${preferences.contentWidth}px`)
  }, [preferences])

  useEffect(() => {
    localStorage.setItem(PAGE_SETUP_KEY, JSON.stringify(pageSetup))
  }, [pageSetup])

  useEffect(() => {
    if (richCommentsRequireSource && !sourceMode) {
      setSourceMode(true)
      showToast('Opened in Source mode to preserve HTML comments')
    }
  }, [richCommentsRequireSource, showToast, sourceMode])

  useEffect(() => {
    let style = document.getElementById('typeopen-custom-theme') as HTMLStyleElement | null
    if (!preferences.customThemeCss) {
      style?.remove()
      return
    }
    if (!style) {
      style = document.createElement('style')
      style.id = 'typeopen-custom-theme'
      document.head.append(style)
    }
    style.textContent = preferences.customThemeCss
    return () => { style?.remove() }
  }, [preferences.customThemeCss])

  useEffect(() => {
    window.typeopen.setDocumentState({ filePath, folderPath, dirty, hasDirtyDocuments, title })
  }, [dirty, filePath, folderPath, hasDirtyDocuments, title])

  useEffect(() => {
    if (!preferences.autosave || !filePath || !dirty) return
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => { void save(false) }, 850)
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current) }
  }, [activeDocumentId, dirty, filePath, markdown, preferences.autosave, save])

  useEffect(() => {
    if (!folderPath) return
    void refreshFolder(folderPath)
  }, [folderPath, refreshFolder])

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()
      const anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement
      const block = anchor?.closest('.typeopen-editor-content > *') as HTMLElement | null
      document.querySelectorAll('.typeopen-editor-content > *').forEach((element) => element.classList.toggle('typeopen-focus-active', element === block))
      if (typewriterMode && block) block.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [typewriterMode])

  useEffect(() => {
    const unsubscribe = window.typeopen.onCommand(({ command, payload }) => {
      if (command === 'new' || command === 'new-tab') newDocument()
      else if (command === 'open') void openFile()
      else if (command === 'open-folder') void openFolder()
      else if (command === 'reopen-closed-file') void reopenClosedFile()
      else if (command === 'open-quickly') setQuickOpenVisible(true)
      else if (command === 'save') void save(false)
      else if (command === 'save-as') void save(true)
      else if (command === 'save-all') void saveAllDocuments(false)
      else if (command === 'save-before-close' || command === 'save-all-before-close') void saveAllDocuments(true)
      else if (command === 'close-tab') void closeDocument(activeDocumentIdRef.current)
      else if (command === 'next-tab') navigateDocument(1)
      else if (command === 'previous-tab') navigateDocument(-1)
      else if (command === 'revert' && filePath) void revertActiveDocument()
      else if (command === 'duplicate-document') void duplicateActiveDocument()
      else if (command === 'rename-document') void relocateActiveDocument('rename')
      else if (command === 'move-document') void relocateActiveDocument('move')
      else if (command === 'open-path' && typeof payload === 'string') void loadFile(payload)
      else if (command === 'export' && typeof payload === 'string') void exportDocument(payload)
      else if (command === 'page-setup') setPageSetupVisible(true)
      else if (command === 'print') void printDocument()
      else if (command === 'toggle-sidebar') setSidebarVisible((value) => !value)
      else if (command === 'sidebar' && ['outline', 'articles', 'files'].includes(String(payload))) { setSidebarVisible(true); setSidebarTab(payload as SidebarTab) }
      else if (command === 'reveal-file-tree') revealCurrentFileInTree()
      else if (command === 'source-mode') toggleSourceMode()
      else if (command === 'read-only-mode') setReadOnly((value) => !value)
      else if (command === 'focus-mode') setFocusMode((value) => !value)
      else if (command === 'typewriter-mode') setTypewriterMode((value) => !value)
      else if (command === 'toggle-status-bar') setPreferences((value) => ({ ...value, statusBar: !value.statusBar }))
      else if (command === 'toggle-toolbar') setPreferences((value) => ({ ...value, toolbar: !value.toolbar }))
      else if (command === 'find') { setFindVisible(true); setReplaceVisible(false) }
      else if (command === 'replace') { setFindVisible(true); setReplaceVisible(true) }
      else if (command === 'search-folder') setGlobalSearchVisible(true)
      else if (command === 'find-next') navigateMatch(1)
      else if (command === 'find-previous') navigateMatch(-1)
      else if (command === 'replace-next') replaceOne()
      else if (command === 'clear-format') {
        if (!editorRef.current?.clearFormat()) showToast('Clear Format is available for a rich-text selection')
      }
      else if (command === 'heading-level' && (payload === 'increase' || payload === 'decrease')) {
        if (!editorRef.current?.changeHeadingLevel(payload)) showToast('Place the caret in a heading that can change level')
      }
      else if (command === 'indent') {
        if (!editorRef.current?.indentList()) showToast('Indent is available for list items')
      }
      else if (command === 'outdent') {
        if (!editorRef.current?.outdentList()) showToast('Outdent is available for list items')
      }
      else if (command === 'task-status') {
        if (!editorRef.current?.toggleTaskStatus()) showToast('Task Status is available for the current checklist item')
      }
      else if (command === 'preferences') setPreferencesVisible(true)
      else if (command === 'insert' && typeof payload === 'string') insertSnippet(payload)
      else if (command === 'format' && typeof payload === 'string') handleFormat(payload)
      else if (command === 'copy-markdown') void window.typeopen.invoke('typeopen:clipboard-write', editorRef.current?.getSelectionMarkdown() || markdown)
      else if (command === 'copy-html') void window.typeopen.invoke('typeopen:clipboard-write', editorRef.current?.getContentEditableHTML() || '')
      else if (command === 'paste-plain') void window.typeopen.invoke<string>('typeopen:clipboard-read').then((text) => editorRef.current?.insertMarkdown(text))
      else if (command === 'about') showToast('TypeOpen 0.1.1 — open-source Markdown editor')
      else if (command === 'documentation') void window.typeopen.invoke('typeopen:open-external', 'https://github.com/TriHerm/TypeOpen')
      else if (command === 'markdown-reference') void window.typeopen.invoke('typeopen:open-external', 'https://commonmark.org/help/')
      else if (command === 'licenses') showToast('TypeOpen is Apache-2.0; third-party notices are included with the project.')
    })
    window.typeopen.rendererReady()
    return unsubscribe
  }, [closeDocument, duplicateActiveDocument, exportDocument, filePath, handleFormat, insertSnippet, loadFile, markdown, navigateDocument, navigateMatch, newDocument, openFile, openFolder, printDocument, relocateActiveDocument, reopenClosedFile, replaceOne, revealCurrentFileInTree, revertActiveDocument, save, saveAllDocuments, showToast, toggleSourceMode])

  const effectiveTheme = preferences.theme
  return (
    <div className={`app-shell theme-${effectiveTheme} ${focusMode ? 'focus-mode' : ''} ${typewriterMode ? 'typewriter-mode' : ''} ${readOnly ? 'readonly-mode' : ''}`}>
      <div className="titlebar-drag-region">
        <div className="titlebar-tools">
          <button className="icon-button no-drag" onClick={() => setSidebarVisible((value) => !value)} title="Toggle Sidebar"><PanelLeft size={15} /></button>
          <button className="icon-button no-drag" onClick={() => void openFile()} title="Open"><FileText size={15} /></button>
          <button className="icon-button no-drag" onClick={() => void openFolder()} title="Open Folder"><FolderOpen size={15} /></button>
          <button className="icon-button no-drag" onClick={() => void save(false)} title="Save"><Save size={15} /></button>
          <button className="icon-button no-drag" onClick={() => { setFindVisible(true); setReplaceVisible(false) }} title="Find"><Search size={15} /></button>
        </div>
        <div className="document-title">{title}{dirty ? ' •' : ''}</div>
        <div className="mode-indicators">
          {sourceMode && <span>Source</span>}
          {focusMode && <span>Focus</span>}
          {typewriterMode && <span>Typewriter</span>}
          {readOnly && <span>Read only</span>}
        </div>
      </div>
      <div className="document-tabs" role="tablist" aria-label="Open documents">
        <div className="document-tabs-scroll">
          {documents.map((document) => {
            const active = document.id === activeDocumentId
            return (
              <div key={document.id} className={`document-tab ${active ? 'active' : ''}`}>
                <button
                  className="document-tab-select"
                  role="tab"
                  aria-selected={active}
                  title={document.filePath || document.importedFrom || documentDisplayTitle(document)}
                  onClick={() => activateDocument(document.id)}
                >
                  <span>{documentDisplayTitle(document)}</span>
                  {isDocumentDirty(document) && <span className="document-tab-dirty" aria-label="Unsaved changes">•</span>}
                </button>
                <button className="document-tab-close" title="Close Tab" aria-label={`Close ${documentDisplayTitle(document)}`} onClick={() => void closeDocument(document.id)}><X size={12} /></button>
              </div>
            )
          })}
        </div>
        <button className="document-tab-add" title="New Tab" aria-label="New Tab" onClick={newDocument}><Plus size={14} /></button>
      </div>
      <div className="workspace">
        <Sidebar visible={sidebarVisible} tab={sidebarTab} onTabChange={setSidebarTab} outline={outline} fileTree={fileTree} currentFilePath={filePath} revealFilePath={fileReveal?.path ?? null} revealRequest={fileReveal?.request ?? 0} onOpenFile={(path) => void loadFile(path)} onHeadingClick={scrollToHeading} />
        <main className="document-workspace">
          <FindBar
            visible={findVisible}
            replaceVisible={replaceVisible}
            query={findQuery}
            replacement={replacement}
            matchCase={matchCase}
            matchCount={matches.length}
            currentMatch={Math.min(currentMatch, Math.max(-1, matches.length - 1))}
            onQueryChange={(value) => { setFindQuery(value); setCurrentMatch(-1) }}
            onReplacementChange={setReplacement}
            onMatchCaseChange={setMatchCase}
            onNext={() => navigateMatch(1)}
            onPrevious={() => navigateMatch(-1)}
            onReplaceOne={replaceOne}
            onReplaceAll={replaceAll}
            onClose={() => setFindVisible(false)}
          />
          <div className="editor-scroll-area">
            {markdown === '' && !filePath && (
              <div className="empty-hint" aria-hidden="true"><BookOpen size={28} /><span>Start writing Markdown</span></div>
            )}
            <MarkdownEditor
              key={`editor-${activeDocumentId}-${sourceMode ? 'source' : 'rich'}`}
              ref={editorRef}
              markdown={markdown}
              onChange={(value) => updateDocument(activeDocumentIdRef.current, (document) => ({ ...document, markdown: value }))}
              readOnly={readOnly}
              sourceMode={sourceMode}
              spellCheck={preferences.spellCheck}
              imageUpload={uploadImage}
              imagePreview={previewImage}
              toolbarVisible={preferences.toolbar}
            />
          </div>
          {preferences.statusBar && (
            <footer className="status-bar">
              <span>{stats.words.toLocaleString()} words</span>
              <span>{stats.characters.toLocaleString()} characters</span>
              <span>{stats.readingMinutes ? `${stats.readingMinutes} min read` : ''}</span>
              <span className="status-spacer" />
              <button onClick={() => setReadOnly((value) => !value)}>{readOnly ? 'Read only' : 'Editable'}</button>
              <button onClick={toggleSourceMode}>{sourceMode ? 'Live view' : 'Source'}</button>
            </footer>
          )}
        </main>
      </div>
      <GlobalSearch visible={globalSearchVisible} folderPath={folderPath} onClose={() => setGlobalSearchVisible(false)} onOpenResult={openGlobalSearchResult} />
      <QuickOpen visible={quickOpenVisible} folderPath={folderPath} fileTree={fileTree} onClose={() => setQuickOpenVisible(false)} onOpenFile={loadFile} />
          <PreferencesDialog visible={preferencesVisible} preferences={preferences} onChange={setPreferences} onClose={() => setPreferencesVisible(false)} onChooseCustomTheme={() => void chooseCustomTheme()} />
          <PageSetupDialog visible={pageSetupVisible} value={pageSetup} onChange={setPageSetup} onClose={() => setPageSetupVisible(false)} />
      {toast && <div className="toast">{toast}</div>}
      {busy && <div className="busy-indicator">Working…</div>}
    </div>
  )
}
