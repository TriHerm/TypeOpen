import { X } from 'lucide-react'

export interface PageSetupState {
  paperSize: 'Letter' | 'A4' | 'Legal' | 'A5' | 'Tabloid'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
}

interface Props {
  visible: boolean
  value: PageSetupState
  onChange: (value: PageSetupState) => void
  onClose: () => void
}

export const DEFAULT_PAGE_SETUP: PageSetupState = {
  paperSize: 'Letter',
  orientation: 'portrait',
  margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 }
}

export function PageSetupDialog({ visible, value, onChange, onClose }: Props) {
  if (!visible) return null
  const patchMargin = (side: keyof PageSetupState['margins'], raw: string) => {
    const number = Math.max(0, Math.min(3, Number(raw) || 0))
    onChange({ ...value, margins: { ...value.margins, [side]: number } })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="page-setup-dialog" role="dialog" aria-modal="true" aria-label="Page Setup">
        <header><strong>Page Setup</strong><button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <div className="page-setup-body">
          <label>Paper size<select value={value.paperSize} onChange={(event) => onChange({ ...value, paperSize: event.target.value as PageSetupState['paperSize'] })}><option>Letter</option><option>A4</option><option>Legal</option><option>A5</option><option>Tabloid</option></select></label>
          <label>Orientation<select value={value.orientation} onChange={(event) => onChange({ ...value, orientation: event.target.value as PageSetupState['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <fieldset>
            <legend>Margins (inches)</legend>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => <label key={side}>{side[0].toUpperCase() + side.slice(1)}<input type="number" min="0" max="3" step="0.1" value={value.margins[side]} onChange={(event) => patchMargin(side, event.target.value)} /></label>)}
          </fieldset>
        </div>
        <footer><button onClick={onClose}>Done</button></footer>
      </section>
    </div>
  )
}
