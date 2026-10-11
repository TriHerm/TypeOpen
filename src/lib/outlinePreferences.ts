export type OutlineMode = 'hierarchical' | 'flat'
export type OutlineMaxLevel = 1 | 2 | 3 | 4 | 5 | 6

export function normalizeOutlineMode(value: unknown): OutlineMode {
  return value === 'flat' ? 'flat' : 'hierarchical'
}

export function normalizeOutlineMaxLevel(value: unknown): OutlineMaxLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
    ? value as OutlineMaxLevel
    : 6
}
