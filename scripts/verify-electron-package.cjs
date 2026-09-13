#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { listPackage } = require('@electron/asar')

const archivePath = process.argv[2]
if (!archivePath) {
  console.error('Usage: verify-electron-package.cjs <resources/app.asar>')
  process.exit(2)
}

if (!fs.existsSync(archivePath)) {
  console.error(`Electron archive does not exist: ${archivePath}`)
  process.exit(1)
}

const archiveEntries = new Set(
  listPackage(archivePath).map((entry) => entry.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^\.\//, '')),
)
const entryPackageNames = [
  '@electron-toolkit/utils',
  'better-sqlite3',
  'express',
  'fast-xml-parser',
  'ws'
]
const visited = new Set()
const missing = new Set()

function packageRoot(name, fromDirectory) {
  // Resolve the directory first so packages with an `exports` map that does not
  // expose `.` (for example dunder-proto) are still checked.
  let directory = fromDirectory
  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    directory = path.dirname(directory)
  }

  let entry
  try {
    entry = require.resolve(name, { paths: [fromDirectory] })
  } catch {
    return undefined
  }
  // Node built-ins resolve to their bare name and do not need packaging.
  if (entry === name) return undefined

  directory = path.dirname(entry)
  while (directory !== path.dirname(directory)) {
    const packageJson = path.join(directory, 'package.json')
    if (fs.existsSync(packageJson)) return directory
    directory = path.dirname(directory)
  }
  return undefined
}

function visit(name, fromDirectory) {
  const root = packageRoot(name, fromDirectory)
  if (!root) {
    missing.add(name)
    return
  }

  const packageJsonPath = path.join(root, 'package.json')
  const metadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const identity = `${metadata.name}@${metadata.version}`
  if (visited.has(identity)) return
  visited.add(identity)

  const archivePackageJson = `node_modules/${name}/package.json`
  if (!archiveEntries.has(archivePackageJson)) missing.add(name)

  for (const dependency of Object.keys(metadata.dependencies || {})) {
    visit(dependency, root)
  }
  for (const dependency of Object.keys(metadata.optionalDependencies || {})) {
    // Optional dependencies may be intentionally absent on the build platform.
    if (packageRoot(dependency, root)) visit(dependency, root)
  }
}

for (const name of entryPackageNames) visit(name, process.cwd())

if (missing.size > 0) {
  console.error(`Missing packaged runtime dependencies: ${[...missing].sort().join(', ')}`)
  process.exit(1)
}

console.log(`Verified ${visited.size} packaged runtime dependencies in ${archivePath}`)
