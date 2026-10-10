import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export interface GlobalSearchResult {
  filePath: string
  relativePath: string
  line: number
  preview: string
}

interface GlobalSearchProps {
  visible: boolean
  folderPath: string | null
  onClose: () => void
  onOpenResult: (result: GlobalSearchResult) => Promise<void>
}

export function GlobalSearch({ visible, folderPath, onClose, onOpenResult }: GlobalSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) queueMicrotask(() => inputRef.current?.focus())
  }, [visible])

  useEffect(() => {
    if (!visible) {
      requestIdRef.current += 1
      return
    }
    const requestId = ++requestIdRef.current
    if (!folderPath || !query) {
      setResults([])
      setTruncated(false)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    const timer = window.setTimeout(() => {
      void window.typeopen.invoke<{ results: GlobalSearchResult[]; truncated: boolean }>('typeopen:search-folder', { query, matchCase })
        .then((response) => {
          if (requestId !== requestIdRef.current) return
          setResults(response.results)
          setTruncated(response.truncated)
        })
        .catch((reason) => {
          if (requestId !== requestIdRef.current) return
          setResults([])
          setTruncated(false)
          setError(reason instanceof Error ? reason.message : String(reason))
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false)
        })
    }, 160)

    return () => window.clearTimeout(timer)
  }, [folderPath, matchCase, query, visible])

  if (!visible) return null

  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="global-search" role="dialog" aria-modal="true" aria-label="Search in Folder">
        <header>
          <div>
            <strong>Search in Folder</strong>
            <span>{folderPath || 'No folder open'}</span>
          </div>
          <button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button>
        </header>
        <div className="global-search-controls">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
            placeholder="Search text"
            disabled={!folderPath}
          />
          <button className={`case-button ${matchCase ? 'active' : ''}`} onClick={() => setMatchCase((value) => !value)} title="Match case" disabled={!folderPath}>Aa</button>
        </div>
        <div className="global-search-results">
          {!folderPath && <div className="global-search-empty">Open a folder to search across Markdown and text files.</div>}
          {folderPath && !query && <div className="global-search-empty">Enter text to search this folder.</div>}
          {folderPath && query && loading && <div className="global-search-empty">Searching…</div>}
          {folderPath && query && !loading && error && <div className="global-search-empty">{error}</div>}
          {folderPath && query && !loading && !error && results.length === 0 && <div className="global-search-empty">No matches found.</div>}
          {!loading && !error && results.map((result) => (
            <button key={`${result.filePath}:${result.line}`} className="global-search-result" onClick={() => void onOpenResult(result)}>
              <div className="global-search-result-meta">
                <strong>{result.relativePath}</strong>
                <span>Line {result.line}</span>
              </div>
              <div className="global-search-preview">{result.preview || ' '}</div>
            </button>
          ))}
          {!loading && truncated && <div className="global-search-limit">Showing the first 250 matching lines.</div>}
        </div>
      </section>
    </div>
  )
}
