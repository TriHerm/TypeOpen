import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const appPath = join(projectRoot, 'release', 'native-arm64', 'TypeOpen.app')
const executablePath = join(appPath, 'Contents', 'MacOS', 'TypeOpen')
const dmgPath = join(projectRoot, 'release', `TypeOpen-${packageJson.version}-arm64.dmg`)
const expectedBundleId = packageJson.build?.appId ?? 'com.triherm.typeopen'

if (!existsSync(appPath)) throw new Error(`Expected native app is missing: ${appPath}`)
if (!existsSync(executablePath)) throw new Error(`Expected native executable is missing: ${executablePath}`)
if (!existsSync(join(appPath, 'Contents', 'Resources', 'renderer', 'index.html'))) throw new Error('Packaged renderer index.html is missing.')
if (!existsSync(join(appPath, 'Contents', 'Resources', 'bridge.js'))) throw new Error('Packaged native bridge.js is missing.')

function verifyApp(targetApp) {
  const targetExecutable = join(targetApp, 'Contents', 'MacOS', 'TypeOpen')
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', targetApp], { stdio: 'inherit' })
  const signature = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', targetApp], { encoding: 'utf8' })
  if (signature.status !== 0 || !`${signature.stdout}${signature.stderr}`.includes('Signature=adhoc')) throw new Error('Expected an ad-hoc signed native app.')
  const architecture = execFileSync('/usr/bin/lipo', ['-archs', targetExecutable], { encoding: 'utf8' }).trim()
  if (architecture !== 'arm64') throw new Error(`Expected native arm64 executable, found: ${architecture}`)
  const bundleId = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(targetApp, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim()
  if (bundleId !== expectedBundleId) throw new Error(`Expected bundle id ${expectedBundleId}, found ${bundleId}`)
  const allPaths = walk(targetApp).map((path) => path.toLowerCase())
  const forbidden = allPaths.filter((path) => {
    const name = path.split('/').pop() ?? ''
    return path.includes('typora.app') ||
      path.includes('.rea-evidence') ||
      path.endsWith('/app.asar') ||
      path.includes('electron framework.framework') ||
      name === '.env' ||
      name.startsWith('.env.') ||
      /\.(?:p12|pfx|cer|crt|key|provisionprofile)$/.test(name)
  })
  if (forbidden.length) throw new Error(`Native bundle contains forbidden/reference/Electron packaging material:\n${forbidden.join('\n')}`)
  return { architecture, bundleId }
}

function walk(root) {
  const output = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    output.push(path)
    if (entry.isDirectory() && !entry.isSymbolicLink()) output.push(...walk(path))
  }
  return output
}

const appResult = verifyApp(appPath)
if (!existsSync(dmgPath)) throw new Error(`Expected native DMG is missing: ${dmgPath}`)
execFileSync('/usr/bin/hdiutil', ['verify', dmgPath], { stdio: 'inherit' })

const mountRoot = mkdtempSync(join(tmpdir(), 'typeopen-native-verify-'))
let mounted = false
try {
  execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mountRoot, dmgPath], { stdio: 'inherit' })
  mounted = true
  verifyApp(join(mountRoot, 'TypeOpen.app'))
} finally {
  if (mounted) {
    try { execFileSync('/usr/bin/hdiutil', ['detach', mountRoot], { stdio: 'inherit' }) } catch {}
  }
  rmSync(mountRoot, { recursive: true, force: true })
}

const appSize = statSync(executablePath).size
const dmgSize = statSync(dmgPath).size
const digest = createHash('sha256').update(readFileSync(dmgPath)).digest('hex')
console.log(`Native executable bytes: ${appSize}`)
console.log(`Native DMG bytes: ${dmgSize}`)
console.log(`Native DMG SHA-256: ${digest}`)
console.log(`Architecture: ${appResult.architecture}`)
console.log(`Bundle ID: ${appResult.bundleId}`)
console.log('Native clean-room/package check: PASS')
