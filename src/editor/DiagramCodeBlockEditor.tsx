import { useEffect, useMemo, useRef, useState } from 'react'
import { CodeMirrorEditor, type CodeBlockEditorProps } from '@mdxeditor/editor'
import flowchart from 'flowchart.js'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })

function normalizeSequence(code: string): string {
  if (/^\s*sequenceDiagram\b/m.test(code)) return code
  const lines = code.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const converted = lines.map((line) => {
    const note = /^Note\s+(right of|left of|over)\s+([^:]+):\s*(.+)$/i.exec(line)
    if (note) return `Note ${note[1]} ${note[2]}: ${note[3]}`
    const match = /^([^\-:]+?)\s*(-{1,2}>>?|--?>?)\s*([^:]+?):\s*(.+)$/.exec(line)
    if (!match) return line
    const arrow = match[2].includes('--') ? '-->>' : '->>'
    return `${match[1].trim()}${arrow}${match[3].trim()}: ${match[4]}`
  })
  return `sequenceDiagram\n${converted.map((line) => `  ${line}`).join('\n')}`
}

function MermaidPreview({ code, language }: { code: string; language: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const source = useMemo(() => language === 'sequence' ? normalizeSequence(code) : code, [code, language])

  useEffect(() => {
    let cancelled = false
    const id = `typeopen-diagram-${Math.random().toString(36).slice(2)}`
    mermaid.render(id, source)
      .then((result) => {
        if (!cancelled) {
          setSvg(result.svg)
          setError('')
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setSvg('')
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => { cancelled = true }
  }, [source])

  return error ? <div className="diagram-error">{error}</div> : <div className="diagram-preview" dangerouslySetInnerHTML={{ __html: svg }} />
}

function FlowPreview({ code }: { code: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.replaceChildren()
    try {
      const diagram = flowchart.parse(code)
      const target = document.createElement('div')
      const id = `typeopen-flow-${Math.random().toString(36).slice(2)}`
      target.id = id
      root.appendChild(target)
      diagram.drawSVG(id, { 'line-width': 2, 'font-size': 14, 'font-family': '-apple-system, BlinkMacSystemFont, sans-serif' })
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [code])

  return error ? <div className="diagram-error">{error}</div> : <div className="diagram-preview" ref={rootRef} />
}

export function DiagramCodeBlockEditor(props: CodeBlockEditorProps) {
  const language = (props.language || 'mermaid').toLowerCase()
  return (
    <div className="diagram-code-block">
      <div className="diagram-editor-pane">
        <CodeMirrorEditor {...props} />
      </div>
      {language === 'flow' || language === 'flowchart'
        ? <FlowPreview code={props.code} />
        : <MermaidPreview code={props.code} language={language} />}
    </div>
  )
}
