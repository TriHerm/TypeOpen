import { useState } from 'react'
import { X } from 'lucide-react'
import { CODE_BLOCK_LANGUAGES, type CodeBlockLanguage } from '../lib/codeLanguages'
import type { OutlineMaxLevel, OutlineMode } from '../lib/outlinePreferences'

export interface TypeOpenPreferences {
  theme: 'system' | 'light' | 'dark'
  customThemeName: string | null
  customThemeCss: string
  fontSize: number
  contentWidth: number
  spellCheck: boolean
  autosave: boolean
  autoPairBrackets: boolean
  defaultCodeLanguage: CodeBlockLanguage
  outlineMode: OutlineMode
  outlineMaxLevel: OutlineMaxLevel
  statusBar: boolean
  toolbar: boolean
  sidebarDefault: boolean
  showHiddenFiles: boolean
}

interface Props {
  visible: boolean
  preferences: TypeOpenPreferences
  onChange: (next: TypeOpenPreferences) => void
  onClose: () => void
  onChooseCustomTheme: () => void
}

export function PreferencesDialog({ visible, preferences, onChange, onClose, onChooseCustomTheme }: Props) {
  const [tab, setTab] = useState<'general' | 'appearance' | 'editor' | 'files' | 'markdown'>('general')
  if (!visible) return null
  const patch = (partial: Partial<TypeOpenPreferences>) => onChange({ ...preferences, ...partial })

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="preferences-dialog" role="dialog" aria-modal="true" aria-label="TypeOpen Preferences">
        <header><strong>Preferences</strong><button className="icon-button" onClick={onClose}><X size={16} /></button></header>
        <div className="preferences-body">
          <nav>
            {(['general', 'appearance', 'editor', 'files', 'markdown'] as const).map((name) => (
              <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)}</button>
            ))}
          </nav>
          <div className="preference-pane">
            {tab === 'general' && <>
              <label className="switch-row"><input type="checkbox" checked={preferences.sidebarDefault} onChange={(event) => patch({ sidebarDefault: event.target.checked })} /> Show sidebar for new windows</label>
              <label>Outline layout<select value={preferences.outlineMode} onChange={(event) => patch({ outlineMode: event.target.value as OutlineMode })}><option value="hierarchical">Hierarchical</option><option value="flat">Flat</option></select></label>
              <label>Outline heading depth<select value={preferences.outlineMaxLevel} onChange={(event) => patch({ outlineMaxLevel: Number(event.target.value) as OutlineMaxLevel })}>{([1, 2, 3, 4, 5, 6] as const).map((level) => <option key={level} value={level}>{level === 1 ? 'H1 only' : `H1–H${level}`}</option>)}</select></label>
              <label className="switch-row"><input type="checkbox" checked={preferences.statusBar} onChange={(event) => patch({ statusBar: event.target.checked })} /> Show status bar</label>
              <label className="switch-row"><input type="checkbox" checked={preferences.toolbar} onChange={(event) => patch({ toolbar: event.target.checked })} /> Show editor toolbar</label>
            </>}
            {tab === 'appearance' && <>
              <label>Theme<select value={preferences.theme} onChange={(event) => patch({ theme: event.target.value as TypeOpenPreferences['theme'] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
              <label>Editor font size <span>{preferences.fontSize}px</span><input type="range" min="13" max="24" value={preferences.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })} /></label>
              <label>Content width <span>{preferences.contentWidth}px</span><input type="range" min="560" max="1050" step="10" value={preferences.contentWidth} onChange={(event) => patch({ contentWidth: Number(event.target.value) })} /></label>
              <div className="custom-theme-row">
                <button onClick={onChooseCustomTheme}>Choose Custom CSS…</button>
                {preferences.customThemeName && <><span>{preferences.customThemeName}</span><button onClick={() => patch({ customThemeName: null, customThemeCss: '' })}>Remove</button></>}
              </div>
              <p className="preference-note">Custom CSS is loaded only from a file you explicitly choose. External-resource CSS is rejected.</p>
            </>}
            {tab === 'editor' && <>
              <label className="switch-row"><input type="checkbox" checked={preferences.spellCheck} onChange={(event) => patch({ spellCheck: event.target.checked })} /> Check spelling while typing</label>
              <label className="switch-row"><input type="checkbox" checked={preferences.autoPairBrackets} onChange={(event) => patch({ autoPairBrackets: event.target.checked })} /> Auto-pair brackets and quotes</label>
              <label>Default code language<select value={preferences.defaultCodeLanguage} onChange={(event) => patch({ defaultCodeLanguage: event.target.value as CodeBlockLanguage })}>{Object.entries(CODE_BLOCK_LANGUAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <p className="preference-note">Markdown shortcuts, tables, code fences, math, links and images are enabled in the live editor.</p>
            </>}
            {tab === 'files' && <>
              <label className="switch-row"><input type="checkbox" checked={preferences.autosave} onChange={(event) => patch({ autosave: event.target.checked })} /> Autosave open files after changes</label>
              <label className="switch-row"><input type="checkbox" checked={preferences.showHiddenFiles} onChange={(event) => patch({ showHiddenFiles: event.target.checked })} /> Show hidden files in folder tree</label>
              <p className="preference-note">Dropped and pasted image files are stored in an <code>assets/</code> directory next to the document when possible.</p>
            </>}
            {tab === 'markdown' && <>
              <p className="preference-note">TypeOpen supports GitHub-style Markdown, tables, task lists, YAML front matter, fenced code, KaTeX math, Mermaid diagrams, sequence diagrams and legacy flowcharts.</p>
              <p className="preference-note">Advanced document import/export uses your local Pandoc installation when available.</p>
            </>}
          </div>
        </div>
      </section>
    </div>
  )
}
