import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export type FileEntryDialogMode = 'create-file' | 'create-folder' | 'rename'

interface Props {
  visible: boolean
  mode: FileEntryDialogMode
  initialName?: string
  onClose: () => void
  onSubmit: (name: string) => void
}

export function FileEntryDialog({ visible, mode, initialName = '', onClose, onSubmit }: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!visible) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setName(initialName)
    queueMicrotask(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      const previous = previousFocusRef.current
      queueMicrotask(() => previous?.isConnected && previous.focus())
      previousFocusRef.current = null
    }
  }, [initialName, visible])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, visible])

  if (!visible) return null
  const title = mode === 'create-file' ? 'New Markdown File' : mode === 'create-folder' ? 'New Folder' : 'Rename Item'
  const submitLabel = mode === 'rename' ? 'Rename' : 'Create'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="file-entry-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header><strong>{title}</strong><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit(name.trim()) }}>
          <input ref={inputRef} aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === 'create-file' ? 'note.md' : 'Name'} />
          <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!name.trim()}>{submitLabel}</button></footer>
        </form>
      </section>
    </div>
  )
}
