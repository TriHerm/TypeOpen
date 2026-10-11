import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, FilePlus2, Folder, FolderOpen, FolderPlus, List, Network, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { buildOutlineTree, outlineAncestorSlugs, type OutlineItem, type OutlineTreeItem } from '../lib/markdown'
import type { OutlineMaxLevel, OutlineMode } from '../lib/outlinePreferences'

export type SidebarTab = 'outline' | 'articles' | 'files'

interface SidebarProps {
  visible: boolean
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  outline: OutlineItem[]
  outlineDocumentKey: string
  activeOutlineSlug: string | null
  outlineMode?: OutlineMode
  outlineMaxLevel?: OutlineMaxLevel
  fileTree: TypeOpenTreeNode[]
  currentFilePath: string | null
  revealFilePath: string | null
  revealRequest: number
  onOpenFile: (path: string) => void
  onHeadingClick: (item: OutlineItem) => void
  onRequestFocusEditor: () => void
  folderPath: string | null
  onCreateEntry: (kind: 'file' | 'folder', parentPath: string | null) => void
  onRenameEntry: (node: TypeOpenTreeNode) => void
  onTrashEntry: (node: TypeOpenTreeNode) => void
  onRefreshFolder: () => void
}

function collapsibleOutlineSlugs(nodes: OutlineTreeItem[]): string[] {
  const result: string[] = []
  const visit = (items: OutlineTreeItem[]) => items.forEach((item) => {
    if (item.children.length) result.push(item.slug)
    visit(item.children)
  })
  visit(nodes)
  return result
}

function OutlineNode({ item, activeOutlineSlug, collapsed, onToggle, onHeadingClick }: {
  item: OutlineTreeItem
  activeOutlineSlug: string | null
  collapsed: Set<string>
  onToggle: (slug: string) => void
  onHeadingClick: (item: OutlineItem) => void
}) {
  const hasChildren = item.children.length > 0
  const isCollapsed = collapsed.has(item.slug)
  return (
    <div className="outline-item">
      <div className="outline-item-row">
        {hasChildren ? (
          <button
            className="outline-toggle"
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${item.text}`}
            aria-expanded={!isCollapsed}
            onClick={() => onToggle(item.slug)}
          >
            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : <span className="outline-toggle-spacer" aria-hidden="true" />}
        <button className={`outline-row level-${item.level} ${activeOutlineSlug === item.slug ? 'active' : ''}`} onClick={() => onHeadingClick(item)} title={`Line ${item.line}`}>
          {item.text}
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="outline-children">
          {item.children.map((child) => (
            <OutlineNode key={child.slug} item={child} activeOutlineSlug={activeOutlineSlug} collapsed={collapsed} onToggle={onToggle} onHeadingClick={onHeadingClick} />
          ))}
        </div>
      )}
    </div>
  )
}

function containsPath(node: TypeOpenTreeNode, targetPath: string): boolean {
  return node.path === targetPath || Boolean(node.children?.some((child) => containsPath(child, targetPath)))
}

function navigationScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

type SortMode = 'name-asc' | 'name-desc' | 'modified-desc' | 'modified-asc'

function sortNodes(nodes: TypeOpenTreeNode[], mode: SortMode): TypeOpenTreeNode[] {
  const direction = mode.endsWith('desc') ? -1 : 1
  return [...nodes].map((node) => ({ ...node, children: node.children ? sortNodes(node.children, mode) : undefined })).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    if (mode.startsWith('modified')) {
      const difference = (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0)
      if (difference !== 0) return difference * direction
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * direction
  })
}

function TreeNode({ node, currentFilePath, revealFilePath, revealRequest, selectedPath, onSelect, onOpenFile }: { node: TypeOpenTreeNode; currentFilePath: string | null; revealFilePath: string | null; revealRequest: number; selectedPath: string | null; onSelect: (node: TypeOpenTreeNode) => void; onOpenFile: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true)
  const rowRef = useRef<HTMLButtonElement>(null)
  const containsReveal = Boolean(revealFilePath && containsPath(node, revealFilePath))

  useEffect(() => {
    if (revealRequest && node.type === 'directory' && containsReveal) setExpanded(true)
  }, [containsReveal, node.type, revealRequest])

  useEffect(() => {
    if (revealRequest && node.type === 'file' && node.path === revealFilePath) {
      requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: 'nearest', behavior: navigationScrollBehavior() }))
    }
  }, [node.path, node.type, revealFilePath, revealRequest])

  if (node.type === 'directory') {
    return (
      <div className="tree-node directory">
        <button className={`tree-row ${selectedPath === node.path ? 'selected' : ''}`} onClick={() => { onSelect(node); setExpanded((value) => !value) }} title={node.path}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{node.name}</span>
        </button>
        {expanded && <div className="tree-children">{node.children?.map((child) => <TreeNode key={child.path} node={child} currentFilePath={currentFilePath} revealFilePath={revealFilePath} revealRequest={revealRequest} selectedPath={selectedPath} onSelect={onSelect} onOpenFile={onOpenFile} />)}</div>}
      </div>
    )
  }
  return (
    <button ref={rowRef} className={`tree-row file ${currentFilePath === node.path ? 'active' : ''} ${selectedPath === node.path ? 'selected' : ''}`} onClick={() => { onSelect(node); onOpenFile(node.path) }} title={node.path}>
      <span className="tree-spacer" />
      <File size={14} />
      <span>{node.name}</span>
    </button>
  )
}

export function Sidebar({ visible, tab, onTabChange, outline, outlineDocumentKey, activeOutlineSlug, outlineMode = 'hierarchical', outlineMaxLevel = 6, fileTree, currentFilePath, revealFilePath, revealRequest, onOpenFile, onHeadingClick, onRequestFocusEditor, folderPath, onCreateEntry, onRenameEntry, onTrashEntry, onRefreshFolder }: SidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null)
  const outlineRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<TypeOpenTreeNode | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('name-asc')
  const [collapsedOutline, setCollapsedOutline] = useState<Set<string>>(() => new Set())
  const sortedTree = useMemo(() => sortNodes(fileTree, sortMode), [fileTree, sortMode])
  const fullOutlineTree = useMemo(() => buildOutlineTree(outline), [outline])
  const visibleOutline = useMemo(() => outline.filter((item) => item.level <= outlineMaxLevel), [outline, outlineMaxLevel])
  const outlineTree = useMemo(() => buildOutlineTree(visibleOutline), [visibleOutline])
  const effectiveActiveOutlineSlug = useMemo(() => {
    if (!activeOutlineSlug) return null
    if (visibleOutline.some((item) => item.slug === activeOutlineSlug)) return activeOutlineSlug
    const visibleSlugs = new Set(visibleOutline.map((item) => item.slug))
    const ancestors = outlineAncestorSlugs(fullOutlineTree, activeOutlineSlug)
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      if (visibleSlugs.has(ancestors[index])) return ancestors[index]
    }
    return null
  }, [activeOutlineSlug, fullOutlineTree, visibleOutline])
  const articles = useMemo(() => {
    const flattened: TypeOpenTreeNode[] = []
    const visit = (nodes: TypeOpenTreeNode[]) => nodes.forEach((node) => {
      if (node.type === 'file' && /\.(md|markdown|mdown|mkd|mdwn|mdtxt|mdtext|rmd|qmd|mdx|txt|text)$/i.test(node.name)) flattened.push(node)
      if (node.children) visit(node.children)
    })
    visit(fileTree)
    return flattened
  }, [fileTree])

  useEffect(() => {
    setCollapsedOutline(new Set())
  }, [outlineDocumentKey])

  useEffect(() => {
    if (outlineMode !== 'hierarchical' || !effectiveActiveOutlineSlug) return
    const ancestors = outlineAncestorSlugs(outlineTree, effectiveActiveOutlineSlug)
    if (!ancestors.length) return
    setCollapsedOutline((current) => {
      if (!ancestors.some((slug) => current.has(slug))) return current
      const next = new Set(current)
      ancestors.forEach((slug) => next.delete(slug))
      return next
    })
  }, [effectiveActiveOutlineSlug, outlineMode, outlineTree])

  useEffect(() => {
    if (!visible || tab !== 'outline' || !effectiveActiveOutlineSlug) return
    const active = outlineRef.current?.querySelector<HTMLElement>('.outline-row.active')
    if (!active) return
    requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest', behavior: navigationScrollBehavior() }))
  }, [collapsedOutline, effectiveActiveOutlineSlug, outlineMaxLevel, outlineMode, tab, visible])

  useEffect(() => {
    if (visible || !sidebarRef.current?.contains(document.activeElement)) return
    onRequestFocusEditor()
  }, [onRequestFocusEditor, visible])

  return (
    <aside ref={sidebarRef} className={`sidebar ${visible ? 'is-visible' : 'is-collapsed'}`} aria-hidden={!visible} inert={!visible}>
      <div className="sidebar-tabs">
        <button className={tab === 'outline' ? 'active' : ''} onClick={() => onTabChange('outline')} title="Outline"><List size={16} /></button>
        <button className={tab === 'articles' ? 'active' : ''} onClick={() => onTabChange('articles')} title="Articles"><Network size={16} /></button>
        <button className={tab === 'files' ? 'active' : ''} onClick={() => onTabChange('files')} title="Files"><Folder size={16} /></button>
      </div>
      <div className="sidebar-content">
        {tab === 'outline' && (
          <div className="outline-list sidebar-panel" ref={outlineRef}>
            {outline.length === 0 && <div className="sidebar-empty">No headings</div>}
            {outline.length > 0 && visibleOutline.length === 0 && <div className="sidebar-empty">No headings at this outline depth</div>}
            {outlineMode === 'hierarchical' && visibleOutline.length > 0 && (
              <div className="outline-toolbar" aria-label="Outline controls">
                <button onClick={() => setCollapsedOutline(new Set())}>Expand all</button>
                <button onClick={() => setCollapsedOutline(new Set(collapsibleOutlineSlugs(outlineTree)))}>Collapse all</button>
              </div>
            )}
            {outlineMode === 'hierarchical' ? outlineTree.map((item) => (
              <OutlineNode
                key={item.slug}
                item={item}
                activeOutlineSlug={effectiveActiveOutlineSlug}
                collapsed={collapsedOutline}
                onToggle={(slug) => setCollapsedOutline((current) => {
                  const next = new Set(current)
                  if (next.has(slug)) next.delete(slug)
                  else next.add(slug)
                  return next
                })}
                onHeadingClick={onHeadingClick}
              />
            )) : visibleOutline.map((item) => (
              <button key={item.slug} className={`outline-row outline-row-flat level-${item.level} ${effectiveActiveOutlineSlug === item.slug ? 'active' : ''}`} onClick={() => onHeadingClick(item)} title={`Line ${item.line}`}>
                {item.text}
              </button>
            ))}
          </div>
        )}
        {tab === 'articles' && (
          <div className="articles-list sidebar-panel">
            {articles.length === 0 && <div className="sidebar-empty">Open a folder to browse articles</div>}
            {articles.map((node) => (
              <button key={node.path} className={`article-row ${currentFilePath === node.path ? 'active' : ''}`} onClick={() => onOpenFile(node.path)}>
                <File size={14} /><span>{node.name}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'files' && (
          <div className="file-tree sidebar-panel">
            <div className="file-tree-toolbar">
              <button onClick={() => onCreateEntry('file', selectedNode?.type === 'directory' ? selectedNode.path : folderPath)} disabled={!folderPath} title="New Markdown file"><FilePlus2 size={14} /></button>
              <button onClick={() => onCreateEntry('folder', selectedNode?.type === 'directory' ? selectedNode.path : folderPath)} disabled={!folderPath} title="New folder"><FolderPlus size={14} /></button>
              <button onClick={onRefreshFolder} disabled={!folderPath} title="Refresh folder"><RefreshCw size={14} /></button>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort files">
                <option value="name-asc">Name ↑</option>
                <option value="name-desc">Name ↓</option>
                <option value="modified-desc">Modified ↓</option>
                <option value="modified-asc">Modified ↑</option>
              </select>
              <span className="file-tree-toolbar-spacer" />
              <button onClick={() => selectedNode && onRenameEntry(selectedNode)} disabled={!selectedNode} title="Rename selected"><Pencil size={14} /></button>
              <button onClick={() => selectedNode && onTrashEntry(selectedNode)} disabled={!selectedNode} title="Move selected to Trash"><Trash2 size={14} /></button>
            </div>
            {fileTree.length === 0 && <div className="sidebar-empty">Open a folder to browse files</div>}
            {sortedTree.map((node) => <TreeNode key={node.path} node={node} currentFilePath={currentFilePath} revealFilePath={revealFilePath} revealRequest={revealRequest} selectedPath={selectedNode?.path ?? null} onSelect={setSelectedNode} onOpenFile={onOpenFile} />)}
          </div>
        )}
      </div>
    </aside>
  )
}
