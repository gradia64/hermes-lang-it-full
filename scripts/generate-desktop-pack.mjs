#!/usr/bin/env node
/** Generate locales/it.desktop.yaml from the fork's typed Italian desktop
 *  catalog (apps/desktop/src/i18n/it.ts). Run from the pack repo with the
 *  hermes-agent checkout path as $HERMES_SRC (default: sibling directory).
 *
 *  Pack format rules (mirrors `hermes plugins validate`): text-only leaves;
 *  functions become positional `{0}` templates; array leaves (composer
 *  placeholder rotations, intro personalities) cannot ship and are skipped. */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const src = process.env.HERMES_SRC || resolve('..', 'gradia-desktop-it')
const desktop = resolve(src, 'apps/desktop')
// js-yaml resolves from the hermes-agent checkout (the pack repo ships no node_modules).
const require = createRequire(resolve(src, 'package.json'))
const yaml = require('js-yaml')

// Bundle the TS catalog with the checkout's own toolchain. String-concat only:
// the entry below cannot contain template literals (it is itself a template).
const itPath = JSON.stringify(resolve(desktop, 'src/i18n/it.ts'))
const entry = [
  "import { itOverrides } from " + itPath,
  "const flat = (obj, prefix = '') => {",
  "  const out = []",
  "  for (const [k, v] of Object.entries(obj)) {",
  "    const p = prefix ? prefix + '.' + k : k",
  "    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flat(v, p))",
  "    else out.push([p, v])",
  "  }",
  "  return out",
  "}",
  "const leaves = {}",
  "for (const [path, value] of flat(itOverrides)) {",
  "  if (path.startsWith('intro.')) continue // display-only, lives in the app",
  "  if (typeof value === 'function') {",
  "    const probes = Array.from({ length: Math.max(value.length, 1) }, (_, i) => '\\u00A7' + i + '\\u00A7')",
  "    const out = String(value(...probes))",
  "    leaves[path] = out.replace(/\\u00A7(\\d+)\\u00A7/g, (_, i) => '{' + i + '}')",
  "  } else if (Array.isArray(value)) {",
  "    continue // the pack format is text-only; arrays fall back to English",
  "  } else {",
  "    leaves[path] = String(value)",
  "  }",
  "}",
  "console.log(JSON.stringify(leaves))"
].join('\n')
const tmpIn = resolve('scripts/.gen-entry.mjs')
writeFileSync(tmpIn, entry)
const tmpOut = resolve('scripts/.gen-bundle.mjs')
execFileSync('npx', ['esbuild', tmpIn, '--bundle', '--format=esm', '--platform=node',
  '--alias:@=' + resolve(desktop, 'src'), '--outfile=' + tmpOut, '--log-level=error'],
  { cwd: desktop, stdio: 'inherit' })
const leaves = JSON.parse(execFileSync('node', [tmpOut], { encoding: 'utf8' }))

// dot keys → nested document, matching the bundled locales' shape.
const nest = (doc, path, value) => {
  const parts = path.split('.')
  let node = doc
  while (parts.length > 1) {
    node = node[parts[0]] ??= {}
    parts.shift()
  }
  node[parts[0]] = value
}
const doc = {}
for (const [path, value] of Object.entries(leaves).sort()) nest(doc, path, value)
mkdirSync('locales', { recursive: true })
const out = yaml.dump(doc, { lineWidth: -1, noRefs: true, quotingType: '"' })
writeFileSync('locales/it.desktop.yaml', out + '\n')
console.error('locales/it.desktop.yaml: ' + Object.keys(leaves).length + ' keys')
