import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react'

interface FindBarProps {
  visible: boolean
  replaceVisible: boolean
  query: string
  replacement: string
  matchCase: boolean
  matchCount: number
  currentMatch: number
  onQueryChange: (value: string) => void
  onReplacementChange: (value: string) => void
  onMatchCaseChange: (value: boolean) => void
  onNext: () => void
  onPrevious: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function FindBar(props: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(props.replaceVisible)
  useEffect(() => { setExpanded(props.replaceVisible) }, [props.replaceVisible])
  useEffect(() => { if (props.visible) queueMicrotask(() => inputRef.current?.focus()) }, [props.visible])
  if (!props.visible) return null

  return (
    <div className="find-bar">
      <div className="find-row">
        <button className="icon-button" onClick={() => setExpanded((value) => !value)} title="Toggle replace"><Replace size={14} /></button>
        <input
          ref={inputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.shiftKey ? props.onPrevious() : props.onNext()
            if (event.key === 'Escape') props.onClose()
          }}
          placeholder="Find"
        />
        <span className="find-count">{props.matchCount ? `${props.currentMatch + 1} / ${props.matchCount}` : '0 / 0'}</span>
        <button className={`case-button ${props.matchCase ? 'active' : ''}`} onClick={() => props.onMatchCaseChange(!props.matchCase)} title="Match case">Aa</button>
        <button className="icon-button" onClick={props.onPrevious} title="Previous"><ChevronUp size={14} /></button>
        <button className="icon-button" onClick={props.onNext} title="Next"><ChevronDown size={14} /></button>
        <button className="icon-button" onClick={props.onClose} title="Close"><X size={14} /></button>
      </div>
      {expanded && (
        <div className="replace-row">
          <span className="replace-indent" />
          <input value={props.replacement} onChange={(event) => props.onReplacementChange(event.target.value)} placeholder="Replace" />
          <button onClick={props.onReplaceOne}>Replace</button>
          <button onClick={props.onReplaceAll}>All</button>
        </div>
      )}
    </div>
  )
}
