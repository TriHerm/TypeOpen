export interface SearchOptions {
  matchCase?: boolean
  wholeWord?: boolean
  regex?: boolean
}

export interface SearchMatch {
  index: number
  length: number
  text: string
}

export interface SearchResult {
  matches: SearchMatch[]
  error: string | null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isWordCharacter(value: string): boolean {
  return value !== '' && /[\p{L}\p{N}_]/u.test(value)
}

function hasWholeWordBoundaries(text: string, index: number, length: number): boolean {
  const before = index > 0 ? text.slice(index - 1, index) : ''
  const after = index + length < text.length ? text.slice(index + length, index + length + 1) : ''
  return !isWordCharacter(before) && !isWordCharacter(after)
}

export function searchText(text: string, query: string, options: SearchOptions = {}): SearchResult {
  if (!query) return { matches: [], error: null }
  const source = options.regex ? query : escapeRegExp(query)
  let expression: RegExp
  try {
    expression = new RegExp(source, options.matchCase ? 'g' : 'gi')
  } catch (error) {
    return { matches: [], error: error instanceof Error ? error.message : 'Invalid regular expression' }
  }

  const matches: SearchMatch[] = []
  let match: RegExpExecArray | null
  while ((match = expression.exec(text)) !== null) {
    if (match[0].length === 0) {
      expression.lastIndex = match.index + 1
      continue
    }
    if (!options.wholeWord || hasWholeWordBoundaries(text, match.index, match[0].length)) {
      matches.push({ index: match.index, length: match[0].length, text: match[0] })
    }
  }
  return { matches, error: null }
}

export function replaceAllSearch(text: string, query: string, replacement: string, options: SearchOptions = {}): { value: string; count: number; error: string | null } {
  const result = searchText(text, query, options)
  if (result.error || result.matches.length === 0) return { value: text, count: 0, error: result.error }

  let cursor = 0
  let output = ''
  for (const match of result.matches) {
    output += text.slice(cursor, match.index)
    output += replacement
    cursor = match.index + match.length
  }
  output += text.slice(cursor)
  return { value: output, count: result.matches.length, error: null }
}
