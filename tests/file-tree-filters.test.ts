import { describe, expect, it } from 'vitest'
import { compileFileTreeExcludeGlobs, filterFileTreeByGlobs } from '../src/lib/fileTreeFilters'

const root = '/workspace'
const tree: TypeOpenTreeNode[] = [
  {
    type: 'directory', name: 'src', path: `${root}/src`, children: [
      { type: 'file', name: 'app.md', path: `${root}/src/app.md` },
      { type: 'file', name: 'draft1.md', path: `${root}/src/draft1.md` },
      { type: 'file', name: 'notes.tmp', path: `${root}/src/notes.tmp` }
    ]
  },
  {
    type: 'directory', name: 'dist', path: `${root}/dist`, children: [
      { type: 'file', name: 'generated.md', path: `${root}/dist/generated.md` }
    ]
  },
  {
    type: 'directory', name: '.cache', path: `${root}/.cache`, children: [
      { type: 'file', name: 'keep.md', path: `${root}/.cache/keep.md` },
      { type: 'file', name: 'other.md', path: `${root}/.cache/other.md` }
    ]
  }
]

function paths(nodes: TypeOpenTreeNode[], output: string[] = []): string[] {
  for (const node of nodes) {
    output.push(node.path)
    if (node.children) paths(node.children, output)
  }
  return output
}

describe('file-library exclusion globs', () => {
  it('compiles basename, single-character and globstar patterns', () => {
    const patterns = compileFileTreeExcludeGlobs('*.tmp\nsrc/draft?.md\ndist/**\nsrc/**/archive?.md')
    expect(patterns).toHaveLength(4)
    expect(patterns[0].expression.test('notes.tmp')).toBe(true)
    expect(patterns[1].expression.test('src/draft1.md')).toBe(true)
    expect(patterns[1].expression.test('src/draft10.md')).toBe(false)
    expect(patterns[2].expression.test('dist')).toBe(true)
    expect(patterns[2].expression.test('dist/generated.md')).toBe(true)
    expect(patterns[3].expression.test('src/archive1.md')).toBe(true)
    expect(patterns[3].expression.test('src/deep/archive2.md')).toBe(true)
  })

  it('filters basename matches at any depth and relative-path globstars', () => {
    const filtered = filterFileTreeByGlobs(tree, root, '*.tmp\ndist/**')
    expect(paths(filtered)).toEqual([
      `${root}/src`, `${root}/src/app.md`, `${root}/src/draft1.md`,
      `${root}/.cache`, `${root}/.cache/keep.md`, `${root}/.cache/other.md`
    ])
  })

  it('prunes an excluded directory subtree', () => {
    const filtered = filterFileTreeByGlobs(tree, root, '.cache')
    expect(paths(filtered)).not.toContain(`${root}/.cache`)
    expect(paths(filtered)).not.toContain(`${root}/.cache/keep.md`)
  })

  it('preserves the active path and only its ancestor branch inside an excluded directory', () => {
    const filtered = filterFileTreeByGlobs(tree, root, '.cache', [`${root}/.cache/keep.md`])
    expect(paths(filtered)).toContain(`${root}/.cache`)
    expect(paths(filtered)).toContain(`${root}/.cache/keep.md`)
    expect(paths(filtered)).not.toContain(`${root}/.cache/other.md`)
  })

  it('does not mutate the source tree', () => {
    const original = structuredClone(tree)
    filterFileTreeByGlobs(tree, root, '*.tmp\ndist/**')
    expect(tree).toEqual(original)
  })
})
