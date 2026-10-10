import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// These packages are compiled into dist/ by Vite. They intentionally live in
// devDependencies so electron-builder (and the native WKWebView packager) do
// not copy their source trees into the application bundle. That means
// `npm audit --omit=dev` would audit an empty tree and provide false assurance.
const BUNDLED_RENDERER_ROOTS = [
  '@lexical/list',
  '@lexical/rich-text',
  '@mdxeditor/editor',
  'dompurify',
  'flowchart.js',
  'katex',
  'lexical',
  'lucide-react',
  'marked',
  'mdast-util-gfm-footnote',
  'mdast-util-math',
  'mermaid',
  'micromark-extension-gfm-footnote',
  'micromark-extension-math',
  'react',
  'react-dom'
]

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/'
  const index = lockPath.lastIndexOf(marker)
  if (index < 0) return null
  const remainder = lockPath.slice(index + marker.length)
  const parts = remainder.split('/')
  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function bundledDependencyNames(lock) {
  const entriesByName = new Map()
  for (const [lockPath, metadata] of Object.entries(lock.packages ?? {})) {
    const name = packageNameFromLockPath(lockPath)
    if (!name) continue
    const entries = entriesByName.get(name) ?? []
    entries.push(metadata)
    entriesByName.set(name, entries)
  }

  const bundled = new Set()
  const queue = [...BUNDLED_RENDERER_ROOTS]
  while (queue.length) {
    const name = queue.pop()
    if (!name || bundled.has(name)) continue
    bundled.add(name)
    for (const entry of entriesByName.get(name) ?? []) {
      for (const dependency of Object.keys(entry.dependencies ?? {})) {
        if (!bundled.has(dependency)) queue.push(dependency)
      }
      for (const dependency of Object.keys(entry.optionalDependencies ?? {})) {
        if (!bundled.has(dependency)) queue.push(dependency)
      }
    }
  }
  return bundled
}

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const bundled = bundledDependencyNames(lock)
for (const root of BUNDLED_RENDERER_ROOTS) {
  if (!bundled.has(root)) {
    console.error(`Bundled dependency audit configuration is stale: ${root} is missing from the lockfile closure.`)
    process.exit(1)
  }
}

const childEnv = { ...process.env }
delete childEnv.npm_config_allow_scripts
delete childEnv.NPM_CONFIG_ALLOW_SCRIPTS

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: childEnv
})

let report
try {
  report = JSON.parse(result.stdout || '{}')
} catch (error) {
  console.error(result.stderr || result.stdout || error)
  process.exit(1)
}

if (!report.metadata?.vulnerabilities) {
  console.error(report.error || result.stderr || 'npm audit did not return vulnerability metadata.')
  process.exit(1)
}

const shippedFindings = Object.entries(report.vulnerabilities ?? {})
  .filter(([name]) => bundled.has(name))
  .map(([name, finding]) => ({ name, severity: finding.severity }))

const counts = { critical: 0, high: 0, moderate: 0, low: 0 }
for (const finding of shippedFindings) {
  if (finding.severity in counts) counts[finding.severity] += 1
}

console.log(`Bundled renderer audit: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low (${bundled.size} dependency names checked).`)
if (counts.critical || counts.high || counts.moderate) {
  const blocking = shippedFindings.filter(({ severity }) => ['critical', 'high', 'moderate'].includes(severity))
  for (const finding of blocking) console.error(`- ${finding.name}: ${finding.severity}`)
  process.exit(1)
}

if (counts.low) {
  console.log('Low-severity findings remain in bundled renderer dependencies; see npm audit for details.')
}

const toolingModerateOrHigher = Object.entries(report.vulnerabilities ?? {})
  .filter(([name, finding]) => !bundled.has(name) && ['critical', 'high', 'moderate'].includes(finding.severity))
if (toolingModerateOrHigher.length) {
  console.log(`Build-tool-only audit findings (not shipped in dist): ${toolingModerateOrHigher.length}.`)
}
