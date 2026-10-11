import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const outputRoot = join(projectRoot, 'release', 'native-arm64')
const appPath = join(outputRoot, 'TypeOpen.app')
const contentsPath = join(appPath, 'Contents')
const macOSPath = join(contentsPath, 'MacOS')
const resourcesPath = join(contentsPath, 'Resources')
const rendererPath = join(resourcesPath, 'renderer')
const executablePath = join(macOSPath, 'TypeOpen')
const nativeSources = [
  'AppDelegate.swift',
  'NativeBridge.swift',
  'PathGrants.swift',
  'RendererSchemeHandler.swift',
  'RenderJob.swift',
  'WindowDrag.swift'
].map((name) => join(projectRoot, 'native', 'Sources', name))

if (!existsSync(join(projectRoot, 'dist', 'index.html'))) {
  throw new Error('dist/index.html is missing. Run npm run build before the native package step.')
}

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(macOSPath, { recursive: true })
mkdirSync(resourcesPath, { recursive: true })

execFileSync('xcrun', [
  'swiftc',
  '-Osize',
  '-whole-module-optimization',
  '-target', 'arm64-apple-macos13.0',
  '-framework', 'AppKit',
  '-framework', 'WebKit',
  '-framework', 'UniformTypeIdentifiers',
  ...nativeSources,
  '-o', executablePath
], { cwd: projectRoot, stdio: 'inherit' })

cpSync(join(projectRoot, 'dist'), rendererPath, { recursive: true })
cpSync(join(projectRoot, 'native', 'bridge.js'), join(resourcesPath, 'bridge.js'))
cpSync(join(projectRoot, 'LICENSE'), join(resourcesPath, 'LICENSE'))
cpSync(join(projectRoot, 'THIRD_PARTY_NOTICES.md'), join(resourcesPath, 'THIRD_PARTY_NOTICES.md'))

const plistTemplate = readFileSync(join(projectRoot, 'native', 'Info.plist'), 'utf8')
const buildVersion = packageJson.version.replace(/[^0-9.]/g, '') || '1'
const plist = plistTemplate
  .replaceAll('__VERSION__', packageJson.version)
  .replaceAll('__BUILD_VERSION__', buildVersion)
writeFileSync(join(contentsPath, 'Info.plist'), plist)
writeFileSync(join(contentsPath, 'PkgInfo'), 'APPL????')

const iconset = join(projectRoot, 'release', '.native-AppIcon.iconset')
const iconOutput = join(resourcesPath, 'AppIcon.icns')
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })
const iconSource = join(projectRoot, 'build', 'icon.png')
for (const [name, size] of [
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024]
]) {
  execFileSync('/usr/bin/sips', ['-z', String(size), String(size), iconSource, '--out', join(iconset, name)], { stdio: 'ignore' })
}
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', iconOutput], { stdio: 'inherit' })
rmSync(iconset, { recursive: true, force: true })

execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })

const size = execFileSync('/usr/bin/du', ['-sh', appPath], { encoding: 'utf8' }).trim()
console.log(`Native app: ${resolve(appPath)}`)
console.log(`Installed size: ${size.split(/\s+/)[0]}`)
