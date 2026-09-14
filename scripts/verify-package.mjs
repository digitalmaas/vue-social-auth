/**
 * Asserts every path declared in package.json resolves to a file the build
 * actually emitted, and that the CommonJS entries are actually consumable.
 * Runs as part of `prepublishOnly`, after `build`.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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

function fail(header, lines) {
  console.error(`${header}\n`)
  for (const line of lines) console.error(`  ${line}`)
  console.error('\nRun `npm run build` first, or fix the declaration.')
  process.exit(1)
}

const paths = declaredPaths()

const missing = paths.filter(([, path]) => !existsSync(resolve(root, path)))
if (missing.length > 0) {
  fail(
    'package.json declares paths that do not exist after build:',
    missing.map(([label, path]) => `${label} → ${path}`),
  )
}

// In a `"type": "module"` package a CommonJS entry MUST NOT be a `.js` file:
// Node parses it as ESM and a UMD factory's exports never bind, so require()
// silently yields an empty object. Existence checks cannot catch that.
if (pkg.type === 'module') {
  const badExtension = paths.filter(
    ([label, path]) => (label === 'main' || label.endsWith('.require')) && !path.endsWith('.cjs'),
  )
  if (badExtension.length > 0) {
    fail(
      'CommonJS entry points in a "type": "module" package must use .cjs:',
      badExtension.map(([label, path]) => `${label} → ${path}`),
    )
  }
}

// Smoke-require the dependency-free callback bundle to prove CJS consumers
// get real exports. (The index bundle externalizes vue-demi, which needs an
// installed `vue`, so it cannot be required from this repo.)
const require = createRequire(import.meta.url)
const callback = require(resolve(root, pkg.exports['./callback'].require))
if (typeof callback.postAuthorizationResult !== 'function') {
  fail('require() of the callback CJS entry did not yield its exports:', [
    `exports.require → ${pkg.exports['./callback'].require}`,
    `got keys: [${Object.keys(callback).join(', ')}]`,
  ])
}

console.log(`package entry points verified (${paths.length} paths, callback CJS require OK)`)
