const MAX_THEME_CSS_BYTES = 512 * 1024

function sanitizeThemeCss(css) {
  if (typeof css !== 'string') throw new Error('Theme CSS must be text.')
  if (Buffer.byteLength(css, 'utf8') > MAX_THEME_CSS_BYTES) throw new Error('Theme CSS is too large (512 KiB maximum).')
  if (css.includes('\0')) throw new Error('Theme CSS contains invalid null bytes.')

  const scan = css.replace(/\/\*[\s\S]*?\*\//g, '')
  if (scan.includes('\\')) throw new Error('Theme CSS escapes are not allowed.')

  const blocked = [
    /@import\b/i,
    /url\s*\(/i,
    /image-set\s*\(/i,
    /expression\s*\(/i,
    /javascript\s*:/i,
    /behavior\s*:/i,
    /-moz-binding\s*:/i
  ]
  if (blocked.some((pattern) => pattern.test(scan))) {
    throw new Error('Theme CSS may not load external resources or executable CSS constructs.')
  }

  return css
}

module.exports = { MAX_THEME_CSS_BYTES, sanitizeThemeCss }
