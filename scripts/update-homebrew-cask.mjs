import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const version = packageJson.version
const dmgPath = join(projectRoot, 'release', `TypeOpen-${version}-arm64.dmg`)
const caskPath = join(projectRoot, 'packaging', 'homebrew-tap', 'Casks', 'typeopen.rb')
const tapReadmePath = join(projectRoot, 'packaging', 'homebrew-tap', 'README.md')

if (!existsSync(dmgPath)) throw new Error(`Release DMG is missing: ${dmgPath}`)
if (!existsSync(caskPath)) throw new Error(`Homebrew cask is missing: ${caskPath}`)

const digest = createHash('sha256').update(readFileSync(dmgPath)).digest('hex')
let cask = readFileSync(caskPath, 'utf8')
cask = cask.replace(/^  version ".*"$/m, `  version "${version}"`)
cask = cask.replace(/^  sha256 ".*"$/m, `  sha256 "${digest}"`)
writeFileSync(caskPath, cask)

if (existsSync(tapReadmePath)) {
  let readme = readFileSync(tapReadmePath, 'utf8')
  readme = readme.replace(/^## v[^\s]+ release metadata$/m, `## v${version} release metadata`)
  readme = readme.replace(/^- Release: `v[^`]+`$/m, `- Release: \`v${version}\``)
  readme = readme.replace(/^- Artifact: `TypeOpen-[^`]+-arm64\.dmg`$/m, `- Artifact: \`TypeOpen-${version}-arm64.dmg\``)
  readme = readme.replace(/^- URL: `https:\/\/github\.com\/TriHerm\/TypeOpen\/releases\/download\/v[^`]+`$/m, `- URL: \`https://github.com/TriHerm/TypeOpen/releases/download/v${version}/TypeOpen-${version}-arm64.dmg\``)
  readme = readme.replace(/^- SHA-256: `[a-f0-9]{64}`$/m, `- SHA-256: \`${digest}\``)
  readme = readme.replace(/The current v[^\s]+ application has a valid ad-hoc code signature/, `The current v${version} application has a valid ad-hoc code signature`)
  writeFileSync(tapReadmePath, readme)
}

console.log(`Homebrew cask synced to TypeOpen ${version}`)
console.log(`SHA-256: ${digest}`)
