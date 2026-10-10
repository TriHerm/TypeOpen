import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'typeopen-native-security-'))
const executable = join(temporaryDirectory, 'SecuritySmoke')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
  return result.status === 0
}

try {
  const compiled = run('xcrun', [
    'swiftc',
    '-target', 'arm64-apple-macos13.0',
    '-framework', 'AppKit',
    '-framework', 'WebKit',
    '-framework', 'UniformTypeIdentifiers',
    'native/Sources/NativeBridge.swift',
    'native/Sources/PathGrants.swift',
    'native/Sources/RendererSchemeHandler.swift',
    'native/Sources/RenderJob.swift',
    'native/Tests/SecuritySmoke.swift',
    '-o', executable
  ])
  if (compiled) run(executable, [])
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
