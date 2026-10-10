import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const releaseDir = join(projectRoot, 'release')
const appPath = join(releaseDir, 'native-arm64', 'TypeOpen.app')
const stagingPath = join(releaseDir, '.native-dmg-staging')
const dmgPath = join(releaseDir, `TypeOpen-${packageJson.version}-arm64.dmg`)

if (!existsSync(appPath)) throw new Error('Native TypeOpen.app is missing. Run npm run native:build first.')

rmSync(stagingPath, { recursive: true, force: true })
rmSync(dmgPath, { force: true })
mkdirSync(stagingPath, { recursive: true })
cpSync(appPath, join(stagingPath, 'TypeOpen.app'), { recursive: true })
symlinkSync('/Applications', join(stagingPath, 'Applications'))

try {
  execFileSync('/usr/bin/hdiutil', [
    'create',
    '-volname', `TypeOpen ${packageJson.version}`,
    '-srcfolder', stagingPath,
    '-ov',
    '-format', 'UDZO',
    dmgPath
  ], { stdio: 'inherit' })
} finally {
  rmSync(stagingPath, { recursive: true, force: true })
}

const size = execFileSync('/usr/bin/du', ['-sh', dmgPath], { encoding: 'utf8' }).trim()
console.log(`Native DMG: ${dmgPath}`)
console.log(`Compressed size: ${size.split(/\s+/)[0]}`)
