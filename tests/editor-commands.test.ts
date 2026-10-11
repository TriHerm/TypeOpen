import { describe, expect, it } from 'vitest'
import { filterSlashCommands, parseSlashQuery } from '../src/editor/slashCommands'

describe('editor slash commands', () => {
  it('keeps the initial menu compact', () => {
    const commands = filterSlashCommands('')
    expect(commands).toHaveLength(8)
    expect(commands.map((command) => command.id)).toEqual(['h1', 'h2', 'h3', 'bullet', 'numbered', 'task', 'quote', 'code'])
  })

  it('finds advanced commands without showing them all initially', () => {
    expect(filterSlashCommands('table')[0]?.id).toBe('table')
    expect(filterSlashCommands('image')[0]?.id).toBe('image')
    expect(filterSlashCommands('math')[0]?.id).toBe('math')
    expect(filterSlashCommands('contents')[0]?.id).toBe('toc')
    expect(filterSlashCommands('note')[0]?.id).toBe('footnote')
  })

  it('only treats slash text at a word boundary as a command query', () => {
    expect(parseSlashQuery('/', 1)).toEqual({ query: '', start: 0, length: 1 })
    expect(parseSlashQuery('hello /ta', 9)).toEqual({ query: 'ta', start: 6, length: 3 })
    expect(parseSlashQuery('https://example.com', 8)).toBeNull()
    expect(parseSlashQuery('word/test', 9)).toBeNull()
  })
})
