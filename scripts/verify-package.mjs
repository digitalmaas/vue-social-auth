/**
 * Asserts every path declared in package.json resolves to a file the build
 * actually emitted. Runs as part of `prepublishOnly`, after `build`.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

/** Collect [label, path] pairs for every declared entry point. */
function declaredPaths() {
  const found = []
  for (const field of ['main', 'module', 'types', 'unpkg', 'jsdelivr']) {
    if (pkg[field]) found.push([field, pkg[field]])
  }
  const walk = (node, label) => {
    if (typeof node === 'string') {
      found.push([label, node])
      return
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${label}.${key}`)
    }
  }
  if (pkg.exports) walk(pkg.exports, 'exports')
  return found
}

const missing = declaredPaths().filter(([, path]) => !existsSync(resolve(root, path)))

if (missing.length > 0) {
  console.error('package.json declares paths that do not exist after build:\n')
  for (const [label, path] of missing) console.error(`  ${label} → ${path}`)
  console.error('\nRun `npm run build` first, or fix the declaration.')
  process.exit(1)
}

console.log(`package entry points verified (${declaredPaths().length} paths)`)
