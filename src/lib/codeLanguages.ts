export const CODE_BLOCK_LANGUAGES = {
  text: 'Plain Text',
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  bash: 'Bash',
  sh: 'Shell',
  python: 'Python',
  py: 'Python (py)',
  sql: 'SQL',
  rust: 'Rust',
  swift: 'Swift',
  mermaid: 'Mermaid',
  sequence: 'Sequence',
  flow: 'Flowchart'
} as const

export type CodeBlockLanguage = keyof typeof CODE_BLOCK_LANGUAGES

export function normalizeCodeBlockLanguage(value: string | null | undefined): CodeBlockLanguage {
  return value && Object.prototype.hasOwnProperty.call(CODE_BLOCK_LANGUAGES, value) ? value as CodeBlockLanguage : 'text'
}

export function effectiveCodeBlockLanguage(
  lastUsed: CodeBlockLanguage | null | undefined,
  persistedDefault: string | null | undefined
): CodeBlockLanguage {
  return lastUsed ?? normalizeCodeBlockLanguage(persistedDefault)
}

export function codeFenceSnippet(language: string | null | undefined, content = 'code'): string {
  return `\`\`\`${normalizeCodeBlockLanguage(language)}\n${content}\n\`\`\``
}
