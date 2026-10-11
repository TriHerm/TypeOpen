import { useLayoutEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'

interface Props {
  visible: boolean
  version: string
  onClose: () => void
  onOpenProject: () => void
  onOpenLabs: () => void
}

export function AboutDialog({ visible, version, onClose, onOpenProject, onOpenLabs }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useLayoutEffect(() => {
    if (!visible) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      const previous = previousFocusRef.current
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus()
      })
    }
  }, [visible])

  if (!visible) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="about-dialog" role="dialog" aria-modal="true" aria-label="About TypeOpen">
        <button ref={closeRef} className="icon-button about-close" onClick={onClose} aria-label="Close About TypeOpen"><X size={16} /></button>
        <div className="about-mark" aria-hidden="true">T</div>
        <div className="about-copy">
          <h2>TypeOpen</h2>
          <span className="about-version">Version {version}</span>
          <p>Open-source Markdown editing for macOS, designed to stay fast, native and focused on the document.</p>
          <div className="about-attribution">
            <strong>A TriHerm Labs project</strong>
            <span>by Fernando Abishai and open-source contributors</span>
          </div>
        </div>
        <footer className="about-actions">
          <button onClick={onOpenLabs}>TriHerm Labs <ExternalLink size={12} /></button>
          <button onClick={onOpenProject}>GitHub <ExternalLink size={12} /></button>
        </footer>
      </section>
    </div>
  )
}
