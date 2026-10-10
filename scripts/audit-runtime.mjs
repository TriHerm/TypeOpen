import { spawnSync } from 'node:child_process'

const childEnv = { ...process.env }
delete childEnv.npm_config_allow_scripts
delete childEnv.NPM_CONFIG_ALLOW_SCRIPTS

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json'], {
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

const counts = report.metadata?.vulnerabilities
if (!counts) {
  console.error(report.error || result.stderr || 'npm audit did not return vulnerability metadata.')
  process.exit(1)
}

console.log(`Runtime audit: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low.`)
if (counts.critical > 0 || counts.high > 0 || counts.moderate > 0) {
  console.error('Release gate failed: runtime dependencies contain moderate-or-higher advisories.')
  process.exit(1)
}

if (counts.low > 0) {
  console.log('Low-severity transitive advisories remain; see npm audit for details.')
}
