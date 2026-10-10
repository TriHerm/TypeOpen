import { execFileSync } from 'node:child_process'

const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
const tracked = output.split('\0').filter(Boolean)
const forbiddenSegments = new Set(['typora.app', '.rea-evidence'])
const forbiddenSecretExtensions = new Set(['.p12', '.cer', '.provisionprofile', '.p8'])

function isForbiddenTrackedPath(file) {
  const segments = file.split('/')
  if (segments.some((segment) => forbiddenSegments.has(segment.toLowerCase()))) return true
  const basename = segments.at(-1)?.toLowerCase() || ''
  if (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) return true
  return [...forbiddenSecretExtensions].some((extension) => basename.endsWith(extension))
}

const forbidden = tracked.filter(isForbiddenTrackedPath)

if (forbidden.length) {
  console.error('Clean-room boundary violation: proprietary reference/evidence or secret material is tracked:')
  for (const file of forbidden) console.error(`- ${file}`)
  process.exit(1)
}

console.log('Clean-room tracked-path check: PASS')
