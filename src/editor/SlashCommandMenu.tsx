import type { SlashCommand } from './slashCommands'

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  selectedIndex: number
  x: number
  y: number
  query: string
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
}

export function SlashCommandMenu({ commands, selectedIndex, x, y, query, onSelect, onHover }: SlashCommandMenuProps) {
  return (
    <div
      className="slash-command-menu"
      style={{ left: x, top: y }}
      role="listbox"
      aria-label="Insert block"
    >
      <div className="slash-command-header">
        <strong>{query ? `/${query}` : 'Insert'}</strong>
        <span>{query ? 'Filtered commands' : 'Type to search more'}</span>
      </div>
      <div className="slash-command-list">
        {commands.length > 0 ? commands.map((command, index) => (
          <button
            key={command.id}
            type="button"
            className={`slash-command-item ${index === selectedIndex ? 'selected' : ''}`}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(command)
            }}
          >
            <span className="slash-command-symbol" aria-hidden="true">{command.symbol}</span>
            <span className="slash-command-copy">
              <strong>{command.label}</strong>
              <small>{command.description}</small>
            </span>
          </button>
        )) : (
          <div className="slash-command-empty">No matching command</div>
        )}
      </div>
      {!query && <div className="slash-command-footer">Search for table, image, math, TOC, footnote, and more.</div>}
    </div>
  )
}
