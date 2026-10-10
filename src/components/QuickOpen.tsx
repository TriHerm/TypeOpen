import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Search, X } from 'lucide-react'

interface Props {
  visible: boolean
  folderPath: string | null
  fileTree: TypeOpenTreeNode[]
  onClose: () => void
  onOpenFile: (path: string) => Promise<boolean>
}

const DOCUMENT_EXTENSION = /\.(?:md|markdown|mmd|mdown|mkd|mdwn|mdtxt|mdtext|rmarkdown|rmd|apib|qmd|mdx|txt|text|textbundle|docx|odt|rtf|epub|tex|latex|ltx|rst|rest|org|wiki|textile|opml)$/i

function flattenDocuments(nodes: TypeOpenTreeNode[], output: TypeOpenTreeNode[] = []) {
  for (const node of nodes) {
    if (node.type === 'file' && DOCUMENT_EXTENSION.test(node.name)) output.push(node)
    if (node.children) flattenDocuments(node.children, output)
  }
  return output
}

function displayPath(filePath: string, folderPath: string | null) {
  const normalized = filePath.replace(/\\/g, '/')
  const root = folderPath?.replace(/\\/g, '/').replace(/\/$/, '')
  return root && normalized.startsWith(`${root}/`) ? normalized.slice(root.length + 1) : normalized
}

export function QuickOpen({ visible, folderPath, fileTree, onClose, onOpenFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const documents = useMemo(() => flattenDocuments(fileTree), [fileTree])
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const ranked = documents.map((node) => ({ node, label: displayPath(node.path, folderPath) }))
    if (!needle) return ranked.slice(0, 100)
    return ranked
      .filter(({ node, label }) => node.name.toLocaleLowerCase().includes(needle) || label.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        const aName = a.node.name.toLocaleLowerCase()
        const bName = b.node.name.toLocaleLowerCase()
        const aStarts = aName.startsWith(needle) ? 0 : 1
        const bStarts = bName.startsWith(needle) ? 0 : 1
        return aStarts - bStarts || a.label.localeCompare(b.label)
      })
      .slice(0, 100)
  }, [documents, folderPath, query])

  useEffect(() => {
    if (!visible) return
    setQuery('')
    setSelectedIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [visible])

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, matches.length - 1)))
  }, [matches.length])

  if (!visible) return null

  const openSelected = async () => {
    const match = matches[selectedIndex]
    if (match && await onOpenFile(match.node.path)) onClose()
  }

  return (
    <div className="quick-open-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="quick-open" role="dialog" aria-modal="true" aria-label="Open Quickly">
        <header>
          <strong>Open Quickly</strong>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="quick-open-input">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Type a filename…"
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0) }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              else if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, matches.length - 1)) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)) }
              else if (event.key === 'Enter') { event.preventDefault(); void openSelected() }
            }}
          />
        </div>
        <div className="quick-open-results">
          {!folderPath && <div className="quick-open-empty">Open a folder to use Open Quickly.</div>}
          {folderPath && matches.length === 0 && <div className="quick-open-empty">No matching documents.</div>}
          {folderPath && matches.map(({ node, label }, index) => (
            <button
              key={node.path}
              className={`quick-open-result ${index === selectedIndex ? 'selected' : ''}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => void onOpenFile(node.path).then((opened) => { if (opened) onClose() })}
            >
              <FileText size={14} />
              <span>{node.name}</span>
              <small>{label}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
