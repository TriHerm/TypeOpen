export interface SlashCommand {
  id: string
  label: string
  description: string
  insertKind: string
  symbol: string
  keywords: string[]
}

export interface SlashQueryMatch {
  query: string
  start: number
  length: number
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', label: 'Heading 1', description: 'Large section heading', insertKind: 'h1', symbol: 'H1', keywords: ['title', 'heading', 'h1'] },
  { id: 'h2', label: 'Heading 2', description: 'Medium section heading', insertKind: 'h2', symbol: 'H2', keywords: ['subtitle', 'heading', 'h2'] },
  { id: 'h3', label: 'Heading 3', description: 'Small section heading', insertKind: 'h3', symbol: 'H3', keywords: ['heading', 'h3'] },
  { id: 'bullet', label: 'Bulleted List', description: 'Start an unordered list', insertKind: 'unordered-list', symbol: '•', keywords: ['bullet', 'list', 'unordered'] },
  { id: 'numbered', label: 'Numbered List', description: 'Start an ordered list', insertKind: 'ordered-list', symbol: '1.', keywords: ['number', 'list', 'ordered'] },
  { id: 'task', label: 'Task List', description: 'Start a checklist', insertKind: 'task-list', symbol: '☑', keywords: ['todo', 'check', 'checklist', 'task'] },
  { id: 'quote', label: 'Quote', description: 'Insert a block quote', insertKind: 'quote', symbol: '›', keywords: ['quote', 'blockquote'] },
  { id: 'code', label: 'Code Block', description: 'Insert a fenced code block', insertKind: 'code-fence', symbol: '</>', keywords: ['code', 'fence', 'pre'] },
  { id: 'table', label: 'Table', description: 'Insert a Markdown table', insertKind: 'table', symbol: '▦', keywords: ['table', 'grid'] },
  { id: 'divider', label: 'Divider', description: 'Insert a horizontal rule', insertKind: 'hr', symbol: '—', keywords: ['divider', 'separator', 'horizontal', 'rule', 'hr'] },
  { id: 'link', label: 'Link', description: 'Insert a Markdown link', insertKind: 'link', symbol: '↗', keywords: ['link', 'url', 'href'] },
  { id: 'image', label: 'Image', description: 'Insert an image reference', insertKind: 'image', symbol: '▧', keywords: ['image', 'photo', 'picture'] },
  { id: 'math', label: 'Math Block', description: 'Insert a display equation', insertKind: 'math-block', symbol: '∑', keywords: ['math', 'equation', 'latex', 'tex'] },
  { id: 'toc', label: 'Table of Contents', description: 'Insert a live document outline', insertKind: 'toc', symbol: 'TOC', keywords: ['toc', 'contents', 'outline'] },
  { id: 'footnote', label: 'Footnote', description: 'Insert a paired GFM footnote', insertKind: 'footnote', symbol: '[1]', keywords: ['footnote', 'note', 'reference'] },
  { id: 'frontmatter', label: 'Front Matter', description: 'Insert YAML document metadata', insertKind: 'frontmatter', symbol: '---', keywords: ['yaml', 'metadata', 'frontmatter'] }
]

const DEFAULT_VISIBLE_COMMANDS = 8

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function filterSlashCommands(query: string, limit = DEFAULT_VISIBLE_COMMANDS): SlashCommand[] {
  const needle = normalized(query)
  if (!needle) return SLASH_COMMANDS.slice(0, limit)

  return SLASH_COMMANDS
    .map((command, index) => {
      const label = normalized(command.label)
      const keywords = command.keywords.map(normalized)
      let score = Number.POSITIVE_INFINITY
      if (label.startsWith(needle)) score = 0
      else if (keywords.some((keyword) => keyword.startsWith(needle))) score = 1
      else if (label.includes(needle) || keywords.some((keyword) => keyword.includes(needle))) score = 2
      return { command, index, score }
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.command)
}

export function parseSlashQuery(text: string, caretOffset: number): SlashQueryMatch | null {
  const safeOffset = Math.max(0, Math.min(caretOffset, text.length))
  const prefix = text.slice(0, safeOffset)
  const match = /(^|\s)\/([^\s/]*)$/.exec(prefix)
  if (!match) return null
  const slashText = `/${match[2]}`
  return {
    query: match[2],
    start: safeOffset - slashText.length,
    length: slashText.length
  }
}
