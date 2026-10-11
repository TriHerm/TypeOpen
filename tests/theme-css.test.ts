import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { sanitizeThemeCss } = require('../electron/theme-css.cjs') as { sanitizeThemeCss: (css: string) => string }
const builtInThemeCss = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8')

function cssHex(block: string, variable: string) {
  const match = block.match(new RegExp(`--${variable}:\\s*(#[0-9a-fA-F]{6});`))
  if (!match) throw new Error(`Missing --${variable}`)
  return match[1]
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe('custom theme CSS sanitizer', () => {
  it('preserves ordinary local CSS', () => {
    const css = '.typeopen-editor-content { font-family: serif; }'
    expect(sanitizeThemeCss(css)).toBe(css)
  })

  it('rejects external-resource CSS', () => {
    expect(() => sanitizeThemeCss('@import "https://example.com/x.css";')).toThrow()
    expect(() => sanitizeThemeCss('body { background: url(https://example.com/x.png) }')).toThrow()
    expect(() => sanitizeThemeCss('body { background: image-set("https://example.com/x.png" 1x) }')).toThrow()
    expect(() => sanitizeThemeCss('body { background: u/**/rl(https://example.com/x.png) }')).toThrow()
    expect(() => sanitizeThemeCss('body { background: u\\72l(https://example.com/x.png) }')).toThrow()
  })
})

describe('built-in editor themes', () => {
  it('maps MDXEditor surfaces to TypeOpen theme tokens instead of its white default', () => {
    expect(builtInThemeCss).toContain('--basePageBg: var(--bg);')
    expect(builtInThemeCss).toContain('--baseTextContrast: var(--text);')
    expect(builtInThemeCss).toContain('[class*="_toolbarCodeBlockLanguageSelectContent_"]')
    expect(builtInThemeCss).toContain('background: var(--popover-bg) !important;')
  })

  it('defines distinct code surfaces for light, dark and CodeMirror states', () => {
    expect(builtInThemeCss).toMatch(/--code-bg:\s*#f3f4f5;/)
    expect(builtInThemeCss).toMatch(/:root\[data-theme="dark"\][\s\S]*--code-bg:\s*#141619;/)
    expect(builtInThemeCss).toContain('.typeopen-mdx-root .cm-gutters')
    expect(builtInThemeCss).toContain('background: var(--code-active) !important;')
    expect(builtInThemeCss).toContain('background: var(--code-selection) !important;')
  })

  it('keeps code text and secondary code text at AA contrast in both themes', () => {
    const light = builtInThemeCss.match(/^:root \{([\s\S]*?)^\}/m)?.[1] ?? ''
    const dark = builtInThemeCss.match(/:root\[data-theme="dark"\] \{([\s\S]*?)^\}/m)?.[1] ?? ''
    for (const block of [light, dark]) {
      const background = cssHex(block, 'code-bg')
      expect(contrastRatio(cssHex(block, 'code-text'), background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(cssHex(block, 'code-muted'), background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(cssHex(block, 'code-syntax-comment'), background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
