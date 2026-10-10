import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { sanitizeThemeCss } = require('../electron/theme-css.cjs') as { sanitizeThemeCss: (css: string) => string }

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
