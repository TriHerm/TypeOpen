import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, List, Network } from 'lucide-react'
import type { OutlineItem } from '../lib/markdown'

export type SidebarTab = 'outline' | 'articles' | 'files'

interface SidebarProps {
  visible: boolean
  tab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  outline: OutlineItem[]
  fileTree: TypeOpenTreeNode[]
  currentFilePath: string | null
  revealFilePath: string | null
  revealRequest: number
  onOpenFile: (path: string) => void
  onHeadingClick: (item: OutlineItem) => void
}

function containsPath(node: TypeOpenTreeNode, targetPath: string): boolean {
  return node.path === targetPath || Boolean(node.children?.some((child) => containsPath(child, targetPath)))
}

function TreeNode({ node, currentFilePath, revealFilePath, revealRequest, onOpenFile }: { node: TypeOpenTreeNode; currentFilePath: string | null; revealFilePath: string | null; revealRequest: number; onOpenFile: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true)
  const rowRef = useRef<HTMLButtonElement>(null)
  const containsReveal = Boolean(revealFilePath && containsPath(node, revealFilePath))

  useEffect(() => {
    if (revealRequest && node.type === 'directory' && containsReveal) setExpanded(true)
  }, [containsReveal, node.type, revealRequest])

  useEffect(() => {
    if (revealRequest && node.type === 'file' && node.path === revealFilePath) {
      requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: 'nearest' }))
    }
  }, [node.path, node.type, revealFilePath, revealRequest])

  if (node.type === 'directory') {
    return (
      <div className="tree-node directory">
        <button className="tree-row" onClick={() => setExpanded((value) => !value)} title={node.path}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          <span>{node.name}</span>
        </button>
        {expanded && <div className="tree-children">{node.children?.map((child) => <TreeNode key={child.path} node={child} currentFilePath={currentFilePath} revealFilePath={revealFilePath} revealRequest={revealRequest} onOpenFile={onOpenFile} />)}</div>}
      </div>
    )
  }
  return (
    <button ref={rowRef} className={`tree-row file ${currentFilePath === node.path ? 'active' : ''}`} onClick={() => onOpenFile(node.path)} title={node.path}>
      <span className="tree-spacer" />
      <File size={14} />
      <span>{node.name}</span>
    </button>
  )
}

export function Sidebar({ visible, tab, onTabChange, outline, fileTree, currentFilePath, revealFilePath, revealRequest, onOpenFile, onHeadingClick }: SidebarProps) {
  const articles = useMemo(() => {
    const flattened: TypeOpenTreeNode[] = []
    const visit = (nodes: TypeOpenTreeNode[]) => nodes.forEach((node) => {
      if (node.type === 'file' && /\.(md|markdown|mdown|mkd|mdwn|mdtxt|mdtext|rmd|qmd|mdx|txt|text)$/i.test(node.name)) flattened.push(node)
      if (node.children) visit(node.children)
    })
    visit(fileTree)
    return flattened
  }, [fileTree])

  if (!visible) return null
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button className={tab === 'outline' ? 'active' : ''} onClick={() => onTabChange('outline')} title="Outline"><List size={16} /></button>
        <button className={tab === 'articles' ? 'active' : ''} onClick={() => onTabChange('articles')} title="Articles"><Network size={16} /></button>
        <button className={tab === 'files' ? 'active' : ''} onClick={() => onTabChange('files')} title="Files"><Folder size={16} /></button>
      </div>
      <div className="sidebar-content">
        {tab === 'outline' && (
          <div className="outline-list">
            {outline.length === 0 && <div className="sidebar-empty">No headings</div>}
            {outline.map((item, index) => (
              <button key={`${item.slug}-${index}`} className={`outline-row level-${item.level}`} onClick={() => onHeadingClick(item)} title={`Line ${item.line}`}>
                {item.text}
              </button>
            ))}
          </div>
        )}
        {tab === 'articles' && (
          <div className="articles-list">
            {articles.length === 0 && <div className="sidebar-empty">Open a folder to browse articles</div>}
            {articles.map((node) => (
              <button key={node.path} className={`article-row ${currentFilePath === node.path ? 'active' : ''}`} onClick={() => onOpenFile(node.path)}>
                <File size={14} /><span>{node.name}</span>
              </button>
            ))}
          </div>
        )}
        {tab === 'files' && (
          <div className="file-tree">
            {fileTree.length === 0 && <div className="sidebar-empty">Open a folder to browse files</div>}
            {fileTree.map((node) => <TreeNode key={node.path} node={node} currentFilePath={currentFilePath} revealFilePath={revealFilePath} revealRequest={revealRequest} onOpenFile={onOpenFile} />)}
          </div>
        )}
      </div>
    </aside>
  )
}
