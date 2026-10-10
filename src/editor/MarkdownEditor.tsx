import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
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
import { $isListItemNode } from '@lexical/list'
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text'
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND, SET_TEXT_FORMAT_COMMAND, type LexicalNode, type TextFormatType } from 'lexical'
import { DiagramCodeBlockEditor } from './DiagramCodeBlockEditor'
import { createHtmlCommentToken, decodeHtmlCommentsFromRichEditor, encodeHtmlCommentsForRichEditor } from './commentEncoding'
import { typeOpenCommentPlugin } from './commentPlugin'
import { typeOpenFootnotePlugin } from './footnotePlugin'
import { typeOpenMathPlugin } from './mathPlugin'
import { typeOpenTocPlugin } from './tocPlugin'

type EditorRealm = Parameters<NonNullable<RealmPlugin['postInit']>>[0]

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
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor({
  markdown,
  onChange,
  readOnly = false,
  sourceMode = false,
  spellCheck = true,
  imageUpload,
  imagePreview,
  toolbarVisible = false
}, forwardedRef) {
  const editorRef = useRef<MDXEditorMethods>(null)
  const realmRef = useRef<EditorRealm | null>(null)
  const commentToken = useRef(createHtmlCommentToken()).current
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
    codeMirrorPlugin({ codeBlockLanguages: { js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', css: 'CSS', html: 'HTML', json: 'JSON', bash: 'Bash', sh: 'Shell', python: 'Python', py: 'Python', sql: 'SQL', rust: 'Rust', swift: 'Swift', mermaid: 'Mermaid', sequence: 'Sequence', flow: 'Flowchart', text: 'Plain Text' } }),
    diffSourcePlugin({ viewMode: (sourceMode ? 'source' : 'rich-text') as ViewMode }),
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
  ], [commandBridgePlugin, commentToken, imagePreview, imageUpload, sourceMode, toolbarVisible])

  const getMutableRichEditor = () => {
    const realm = realmRef.current
    if (!realm || realm.getValue(readOnly$) || realm.getValue(viewMode$) !== 'rich-text') return null
    const editor = realm.getValue(activeEditor$)
    return editor?.getRootElement() ? { realm, editor } : null
  }

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
  )
})
