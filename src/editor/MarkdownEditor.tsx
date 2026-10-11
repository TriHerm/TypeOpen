import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  activeEditor$,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeMirrorEditor,
  CreateLink,
  convertSelectionToNode$,
  currentBlockType$,
  currentListType$,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  readOnly$,
  type RealmPlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
  type ViewMode,
  viewMode$
} from '@mdxeditor/editor'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { $isListItemNode } from '@lexical/list'
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text'
import { $getSelection, $isRangeSelection, $isTextNode, FORMAT_TEXT_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND, SET_TEXT_FORMAT_COMMAND, type LexicalNode, type TextFormatType } from 'lexical'
import { tags } from '@lezer/highlight'
import { DiagramCodeBlockEditor } from './DiagramCodeBlockEditor'
import { SlashCommandMenu } from './SlashCommandMenu'
import { createHtmlCommentToken, decodeHtmlCommentsFromRichEditor, encodeHtmlCommentsForRichEditor } from './commentEncoding'
import { typeOpenCommentPlugin } from './commentPlugin'
import { typeOpenFootnotePlugin } from './footnotePlugin'
import { typeOpenMathPlugin } from './mathPlugin'
import { typeOpenTocPlugin } from './tocPlugin'
import { typeOpenTypingErgonomicsPlugin } from './typingErgonomicsPlugin'
import { TYPEOPEN_SOURCE_TYPING } from './sourceTyping'
import { filterSlashCommands, isRootEditableSelection, parseSlashQuery, type SlashCommand } from './slashCommands'

type EditorRealm = Parameters<NonNullable<RealmPlugin['postInit']>>[0]

const TYPEOPEN_CODE_HIGHLIGHT = Prec.highest(syntaxHighlighting(HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: 'var(--code-syntax-keyword)' },
  { tag: [tags.name, tags.variableName, tags.propertyName, tags.attributeName], color: 'var(--code-syntax-variable)' },
  { tag: tags.function(tags.variableName), color: 'var(--code-syntax-function)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.escape], color: 'var(--code-syntax-string)' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--code-syntax-number)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--code-syntax-type)' },
  { tag: tags.tagName, color: 'var(--code-syntax-tag)' },
  { tag: [tags.operator, tags.separator], color: 'var(--code-syntax-operator)' },
  { tag: [tags.comment, tags.meta], color: 'var(--code-syntax-comment)', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--code-syntax-invalid)', textDecoration: 'underline wavy' }
])))

export interface MarkdownEditorHandle {
  getMarkdown(): string
  setMarkdown(value: string): void
  insertMarkdown(value: string): void
  getSelectionMarkdown(): string
  getContentEditableHTML(): string
  clearFormat(): boolean
  changeHeadingLevel(direction: 'increase' | 'decrease'): boolean
  indentList(): boolean
  outdentList(): boolean
  toggleTaskStatus(): boolean
  toggleTextFormat(format: Extract<TextFormatType, 'highlight' | 'superscript' | 'subscript'>): boolean
  focus(): void
}

interface MarkdownEditorProps {
  markdown: string
  onChange: (value: string) => void
  readOnly?: boolean
  sourceMode?: boolean
  spellCheck?: boolean
  imageUpload?: (file: File) => Promise<string>
  imagePreview?: (source: string) => Promise<string>
  toolbarVisible?: boolean
  autoPairBrackets?: boolean
  onSlashCommand?: (insertKind: string) => void
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  markdown,
  onChange,
  readOnly = false,
  sourceMode = false,
  spellCheck = true,
  imageUpload,
  imagePreview,
  toolbarVisible = false,
  autoPairBrackets = true,
  onSlashCommand
}, forwardedRef) {
  const editorRef = useRef<MDXEditorMethods>(null)
  const realmRef = useRef<EditorRealm | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const commentToken = useRef(createHtmlCommentToken()).current
  const [slashMenu, setSlashMenu] = useState<{ query: string; x: number; y: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const commandBridgePlugin = useMemo<RealmPlugin>(() => ({
    postInit(realm) { realmRef.current = realm },
    update(realm) { realmRef.current = realm }
  }), [])
  const plugins = useMemo(() => [
    headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    imagePlugin({ imageUploadHandler: imageUpload, imagePreviewHandler: imagePreview }),
    tablePlugin(),
    frontmatterPlugin(),
    typeOpenCommentPlugin(commentToken),
    typeOpenFootnotePlugin(),
    typeOpenMathPlugin(),
    typeOpenTocPlugin(),
    typeOpenTypingErgonomicsPlugin(autoPairBrackets),
    codeBlockPlugin({
      defaultCodeBlockLanguage: 'text',
      codeBlockEditorDescriptors: [
        {
          priority: 100,
          match: (language) => ['mermaid', 'sequence', 'flow', 'flowchart'].includes((language || '').toLowerCase()),
          Editor: DiagramCodeBlockEditor
        },
        {
          priority: 0,
          match: () => true,
          Editor: CodeMirrorEditor
        }
      ]
    }),
    codeMirrorPlugin({
      codeBlockLanguages: { js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', css: 'CSS', html: 'HTML', json: 'JSON', bash: 'Bash', sh: 'Shell', python: 'Python', py: 'Python', sql: 'SQL', rust: 'Rust', swift: 'Swift', mermaid: 'Mermaid', sequence: 'Sequence', flow: 'Flowchart', text: 'Plain Text' },
      codeMirrorExtensions: [TYPEOPEN_CODE_HIGHLIGHT]
    }),
    diffSourcePlugin({ viewMode: (sourceMode ? 'source' : 'rich-text') as ViewMode, codeMirrorExtensions: [TYPEOPEN_CODE_HIGHLIGHT, TYPEOPEN_SOURCE_TYPING] }),
    markdownShortcutPlugin(),
    commandBridgePlugin,
    ...(toolbarVisible ? [toolbarPlugin({
      toolbarContents: () => (
        <DiffSourceToggleWrapper options={['rich-text', 'source']}>
          <UndoRedo />
          <Separator />
          <BlockTypeSelect />
          <Separator />
          <BoldItalicUnderlineToggles />
          <Separator />
          <ListsToggle options={['bullet', 'number', 'check']} />
          <Separator />
          <CreateLink />
          <InsertImage />
          <InsertTable />
          <InsertThematicBreak />
          <InsertCodeBlock />
        </DiffSourceToggleWrapper>
      )
    })] : [])
  ], [autoPairBrackets, commandBridgePlugin, commentToken, imagePreview, imageUpload, sourceMode, toolbarVisible])

  const getMutableRichEditor = () => {
    const realm = realmRef.current
    if (!realm || realm.getValue(readOnly$) || realm.getValue(viewMode$) !== 'rich-text') return null
    const editor = realm.getValue(activeEditor$)
    return editor?.getRootElement() ? { realm, editor } : null
  }

  const visibleSlashCommands = useMemo(
    () => slashMenu ? filterSlashCommands(slashMenu.query) : [],
    [slashMenu]
  )

  const getSlashContext = useCallback(() => {
    if (sourceMode || readOnly) {
      return null
    }
    const contentRoot = surfaceRef.current?.querySelector<HTMLElement>('.typeopen-editor-content')
    const selection = window.getSelection()
    if (!contentRoot || !selection || !selection.isCollapsed || !selection.anchorNode || !contentRoot.contains(selection.anchorNode)) {
      return null
    }
    if (selection.anchorNode.nodeType !== Node.TEXT_NODE || !isRootEditableSelection(contentRoot, selection.anchorNode)) {
      return null
    }
    const match = parseSlashQuery(selection.anchorNode.textContent ?? '', selection.anchorOffset)
    if (!match) return null
    return { contentRoot, selection, match }
  }, [readOnly, sourceMode])

  const syncSlashMenu = useCallback(() => {
    const context = getSlashContext()
    if (!context) {
      setSlashMenu(null)
      return
    }

    const { selection, match } = context
    const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const rect = range && typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : ({ left: 24, right: 24, top: 80, bottom: 80 } as DOMRect)
    const menuWidth = 292
    const menuHeight = 360
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
    const below = rect.bottom + 7
    const y = below + menuHeight <= window.innerHeight
      ? below
      : Math.max(8, rect.top - menuHeight - 7)
    setSlashMenu({ query: match.query, x, y })
  }, [getSlashContext])

  const removeSlashQuery = useCallback(() => {
    const context = getMutableRichEditor()
    if (!context) return false
    let removed = false
    context.editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
      const node = selection.anchor.getNode()
      if (!$isTextNode(node)) return
      const match = parseSlashQuery(node.getTextContent(), selection.anchor.offset)
      if (!match) return
      node.spliceText(match.start, match.length, '', true)
      node.select(match.start, match.start)
      removed = true
    }, { discrete: true })
    return removed
  }, [])

  const executeSlashCommand = useCallback((command: SlashCommand) => {
    if (!removeSlashQuery()) return
    setSlashMenu(null)
    setSlashIndex(0)
    onSlashCommand?.(command.insertKind)
    queueMicrotask(() => editorRef.current?.focus())
  }, [onSlashCommand, removeSlashQuery])

  const handleSurfaceKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!slashMenu) return
    if (!getSlashContext()) {
      setSlashMenu(null)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setSlashMenu(null)
      return
    }
    if (!visibleSlashCommands.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSlashIndex((index) => (index + 1) % visibleSlashCommands.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSlashIndex((index) => (index - 1 + visibleSlashCommands.length) % visibleSlashCommands.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      executeSlashCommand(visibleSlashCommands[Math.min(slashIndex, visibleSlashCommands.length - 1)])
    }
  }, [executeSlashCommand, getSlashContext, slashIndex, slashMenu, visibleSlashCommands])

  useEffect(() => {
    setSlashIndex(0)
  }, [slashMenu?.query])

  useEffect(() => {
    if (sourceMode || readOnly) setSlashMenu(null)
  }, [readOnly, sourceMode])

  useEffect(() => {
    document.addEventListener('selectionchange', syncSlashMenu)
    window.addEventListener('resize', syncSlashMenu)
    return () => {
      document.removeEventListener('selectionchange', syncSlashMenu)
      window.removeEventListener('resize', syncSlashMenu)
    }
  }, [syncSlashMenu])

  useImperativeHandle(forwardedRef, () => ({
    getMarkdown: () => sourceMode ? (editorRef.current?.getMarkdown() ?? markdown) : decodeHtmlCommentsFromRichEditor(editorRef.current?.getMarkdown() ?? markdown, commentToken),
    setMarkdown: (value) => editorRef.current?.setMarkdown(sourceMode ? value : encodeHtmlCommentsForRichEditor(value, commentToken)),
    insertMarkdown: (value) => editorRef.current?.insertMarkdown(sourceMode ? value : encodeHtmlCommentsForRichEditor(value, commentToken)),
    getSelectionMarkdown: () => sourceMode ? (editorRef.current?.getSelectionMarkdown() ?? '') : decodeHtmlCommentsFromRichEditor(editorRef.current?.getSelectionMarkdown() ?? '', commentToken),
    getContentEditableHTML: () => editorRef.current?.getContentEditableHTML() ?? '',
    clearFormat: () => {
      const context = getMutableRichEditor()
      if (!context) return false
      const { editor } = context
      const applied = editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        highlight: false,
        code: false,
        subscript: false,
        superscript: false,
        lowercase: false,
        uppercase: false,
        capitalize: false
      })
      if (applied) editor.focus()
      return applied
    },
    changeHeadingLevel: (direction) => {
      const context = getMutableRichEditor()
      if (!context) return false
      const { realm, editor } = context
      const current = realm.getValue(currentBlockType$)
      const match = /^h([1-6])$/.exec(current)
      if (!match) return false
      const level = Number(match[1])
      const nextLevel = direction === 'increase' ? Math.max(1, level - 1) : Math.min(6, level + 1)
      if (nextLevel === level) return false
      realm.pub(convertSelectionToNode$, () => $createHeadingNode(`h${nextLevel}` as HeadingTagType))
      editor.focus()
      return true
    },
    indentList: () => {
      const context = getMutableRichEditor()
      if (!context || !context.realm.getValue(currentListType$)) return false
      const applied = context.editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
      if (applied) context.editor.focus()
      return applied
    },
    outdentList: () => {
      const context = getMutableRichEditor()
      if (!context || !context.realm.getValue(currentListType$)) return false
      const applied = context.editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
      if (applied) context.editor.focus()
      return applied
    },
    toggleTaskStatus: () => {
      const context = getMutableRichEditor()
      if (!context || context.realm.getValue(currentListType$) !== 'check') return false
      let toggled = false
      context.editor.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        let node: LexicalNode | null = selection.anchor.getNode()
        while (node) {
          if ($isListItemNode(node)) {
            const checked = node.getChecked()
            if (checked === undefined) return
            node.setChecked(!checked)
            toggled = true
            return
          }
          node = node.getParent()
        }
      }, { discrete: true })
      if (toggled) context.editor.focus()
      return toggled
    },
    toggleTextFormat: (format) => {
      const context = getMutableRichEditor()
      if (!context) return false
      const applied = context.editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)
      if (applied) context.editor.focus()
      return applied
    },
    focus: () => editorRef.current?.focus()
  }), [markdown, sourceMode])

  return (
    <div
      ref={surfaceRef}
      className="typeopen-editor-surface"
      onInput={syncSlashMenu}
      onKeyDownCapture={handleSurfaceKeyDown}
    >
      <MDXEditor
        ref={editorRef}
        markdown={sourceMode ? markdown : encodeHtmlCommentsForRichEditor(markdown, commentToken)}
        trim={false}
        onChange={(value, normalized) => { if (!normalized) onChange(sourceMode ? value : decodeHtmlCommentsFromRichEditor(value, commentToken)) }}
        onError={(payload) => console.warn('Markdown parse error', payload.error)}
        readOnly={readOnly}
        spellCheck={spellCheck}
        suppressHtmlProcessing={sourceMode}
        className="typeopen-mdx-root"
        contentEditableClassName="typeopen-editor-content"
        plugins={plugins}
      />
      {slashMenu && (
        <SlashCommandMenu
          commands={visibleSlashCommands}
          selectedIndex={Math.min(slashIndex, Math.max(0, visibleSlashCommands.length - 1))}
          x={slashMenu.x}
          y={slashMenu.y}
          query={slashMenu.query}
          onHover={setSlashIndex}
          onSelect={executeSlashCommand}
        />
      )}
    </div>
  )
})
