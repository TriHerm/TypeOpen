function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function normalizePattern(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function escapeRegexCharacter(value: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(value) ? `\\${value}` : value
}

function globSource(pattern: string): string {
  let source = ''
  let index = 0
  while (index < pattern.length) {
    if (pattern.slice(index, index + 3) === '**/') {
      source += '(?:.*/)?'
      index += 3
      continue
    }
    if (pattern.slice(index, index + 3) === '/**' && index + 3 === pattern.length) {
      source += '(?:/.*)?'
      index += 3
      continue
    }
    if (pattern.slice(index, index + 2) === '**') {
      source += '.*'
      index += 2
      continue
    }
    if (pattern[index] === '*') source += '[^/]*'
    else if (pattern[index] === '?') source += '[^/]'
    else source += escapeRegexCharacter(pattern[index])
    index += 1
  }
  return source
}

interface CompiledPattern {
  basenameOnly: boolean
  expression: RegExp
}

export function compileFileTreeExcludeGlobs(value: string): CompiledPattern[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(/\r?\n/)
    .slice(0, 100)
    .map((line) => normalizePattern(line).slice(0, 256))
    .filter(Boolean)
    .map((pattern) => ({
      basenameOnly: !pattern.includes('/'),
      expression: new RegExp(`^${globSource(pattern)}$`)
    }))
}

function relativeTreePath(nodePath: string, folderPath: string): string | null {
  const node = normalizeSeparators(nodePath)
  const root = normalizeSeparators(folderPath)
  if (node === root) return ''
  return node.startsWith(`${root}/`) ? node.slice(root.length + 1) : null
}

function isPreservedBranch(nodePath: string, preservePaths: string[]): boolean {
  const node = normalizeSeparators(nodePath)
  return preservePaths.some((candidate) => candidate === node || candidate.startsWith(`${node}/`))
}

export function filterFileTreeByGlobs(
  nodes: TypeOpenTreeNode[],
  folderPath: string | null,
  patternText: string,
  preservePaths: Array<string | null | undefined> = []
): TypeOpenTreeNode[] {
  if (!folderPath) return nodes
  const patterns = compileFileTreeExcludeGlobs(patternText)
  if (!patterns.length) return nodes

  const preserved = preservePaths.filter((value): value is string => typeof value === 'string' && value.length > 0).map(normalizeSeparators)
  const visit = (node: TypeOpenTreeNode, ancestorExcluded = false): TypeOpenTreeNode | null => {
    const relativePath = relativeTreePath(node.path, folderPath)
    const matches = relativePath !== null && patterns.some(({ basenameOnly, expression }) => expression.test(basenameOnly ? node.name : relativePath))
    const excluded = ancestorExcluded || matches
    const preservedBranch = isPreservedBranch(node.path, preserved)
    if (excluded && !preservedBranch) return null

    if (!node.children) return node
    const children = node.children
      .map((child) => visit(child, excluded))
      .filter((child): child is TypeOpenTreeNode => child !== null)
    return { ...node, children }
  }

  return nodes.map((node) => visit(node)).filter((node): node is TypeOpenTreeNode => node !== null)
}
