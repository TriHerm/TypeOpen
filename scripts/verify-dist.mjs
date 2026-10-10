import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const releaseDir = join(projectRoot, 'release')
const appPath = join(releaseDir, 'mac-arm64', 'TypeOpen.app')
const executablePath = join(appPath, 'Contents', 'MacOS', 'TypeOpen')
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const expectedBundleId = packageJson.build?.appId
const dmgPath = join(releaseDir, `TypeOpen-${packageJson.version}-arm64.dmg`)

if (!existsSync(releaseDir)) throw new Error('release/ does not exist. Build the package first.')
if (!existsSync(appPath)) throw new Error(`Expected packaged app is missing: ${appPath}`)
if (!existsSync(executablePath)) throw new Error(`Expected packaged executable is missing: ${executablePath}`)
if (!expectedBundleId) throw new Error('package.json build.appId is missing.')

function verifyBundleIdentity(targetApp) {
  const plistPath = join(targetApp, 'Contents', 'Info.plist')
  const bundleId = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plistPath], { encoding: 'utf8' }).trim()
  if (bundleId !== expectedBundleId) throw new Error(`Expected CFBundleIdentifier ${expectedBundleId}, found ${bundleId || '(empty)'}.`)
  return bundleId
}

execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' })
const bundleId = verifyBundleIdentity(appPath)
const signature = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], { encoding: 'utf8' })
if (signature.status !== 0) throw new Error(`Unable to inspect app signature:\n${signature.stderr || signature.stdout}`)
if (!`${signature.stdout}${signature.stderr}`.includes('Signature=adhoc')) {
  throw new Error('Expected an ad-hoc signed local app, but codesign did not report Signature=adhoc.')
}
const appArchitectures = execFileSync('/usr/bin/lipo', ['-archs', executablePath], { encoding: 'utf8' }).trim()
if (appArchitectures !== 'arm64') throw new Error(`Expected an Apple Silicon-only app, found architectures: ${appArchitectures}`)

const asarPath = join(appPath, 'Contents', 'Resources', 'app.asar')
if (!existsSync(asarPath)) throw new Error(`Packaged app.asar is missing: ${asarPath}`)

const asarCli = join(projectRoot, 'node_modules', '.bin', 'asar')
if (!existsSync(asarCli)) throw new Error('asar CLI is missing; run npm ci before release verification.')
const asarListing = execFileSync(asarCli, ['list', asarPath], { encoding: 'utf8' })
function assertCleanAsar(listing, label) {
  const entries = listing.split(/\r?\n/).filter(Boolean)
  const forbidden = entries.filter((entry) => {
    const lower = entry.toLowerCase()
    const basename = lower.split('/').at(-1) || ''
    if (lower.includes('typora.app') || lower.includes('.rea-evidence')) return true
    if (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) return true
    return ['.p12', '.cer', '.provisionprofile', '.p8'].some((extension) => basename.endsWith(extension))
  })
  if (forbidden.length) throw new Error(`Clean-room ${label} violation: forbidden material is present:\n${forbidden.join('\n')}`)
}
assertCleanAsar(asarListing, 'release')

if (!existsSync(dmgPath)) throw new Error(`Expected Apple Silicon DMG is missing: ${dmgPath}`)
const dmgSize = statSync(dmgPath).size
if (dmgSize < 1024 * 1024) throw new Error('DMG is unexpectedly small.')
execFileSync('/usr/bin/hdiutil', ['verify', dmgPath], { stdio: 'inherit' })

const mountRoot = mkdtempSync(join(tmpdir(), 'typeopen-verify-'))
let mounted = false
try {
  execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountRoot, dmgPath], { stdio: 'inherit' })
  mounted = true
  const mountedApp = join(mountRoot, 'TypeOpen.app')
  if (!existsSync(mountedApp)) throw new Error('Mounted DMG does not contain TypeOpen.app.')
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', mountedApp], { stdio: 'inherit' })
  verifyBundleIdentity(mountedApp)
  const mountedExecutable = join(mountedApp, 'Contents', 'MacOS', 'TypeOpen')
  const mountedArchitectures = execFileSync('/usr/bin/lipo', ['-archs', mountedExecutable], { encoding: 'utf8' }).trim()
  if (mountedArchitectures !== 'arm64') throw new Error(`Mounted DMG app has unexpected architectures: ${mountedArchitectures}`)

  const mountedAsar = join(mountedApp, 'Contents', 'Resources', 'app.asar')
  const mountedListing = execFileSync(asarCli, ['list', mountedAsar], { encoding: 'utf8' })
  assertCleanAsar(mountedListing, 'DMG')
} finally {
  if (mounted) {
    try {
      execFileSync('/usr/bin/hdiutil', ['detach', mountRoot], { stdio: 'inherit' })
    } catch {
      // The verification result already failed or completed; cleanup is best effort.
    }
  }
  rmSync(mountRoot, { recursive: true, force: true })
}

const digest = createHash('sha256').update(readFileSync(dmgPath)).digest('hex')
console.log(`App: ${appPath}`)
console.log(`DMG: ${dmgPath}`)
console.log(`Size: ${dmgSize} bytes`)
console.log(`SHA-256: ${digest}`)
console.log(`Architecture: ${appArchitectures}`)
console.log(`Bundle ID: ${bundleId}`)
console.log('Signing: ad-hoc')
console.log('Clean-room package check: PASS (reference/evidence and secret material absent)')
