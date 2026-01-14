import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const packagePath = join(process.cwd(), 'packages', 'sherpa', 'package.json')
const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))
const packageName = pkg.name
const currentVersion = pkg.version

function getPublishedVersions(name) {
  try {
    const output = execSync(`npm view ${name} versions --json`, {
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString()
    const parsed = JSON.parse(output)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function bumpPatch(version) {
  const parts = version.split('.').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Unsupported version format: ${version}`)
  }
  parts[2] += 1
  return parts.join('.')
}

const publishedVersions = getPublishedVersions(packageName)
if (!publishedVersions.includes(currentVersion)) {
  process.stdout.write('release:sherpa: version not published, skipping bump.\n')
  process.exit(0)
}

const nextVersion = bumpPatch(currentVersion)
pkg.version = nextVersion
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
process.stdout.write(`release:sherpa: bumped ${packageName} to ${nextVersion}.\n`)
