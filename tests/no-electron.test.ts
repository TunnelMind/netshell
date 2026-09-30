// SC-003: the shared core and the CLI must run under plain Node, so neither may import electron.
import { test } from 'node:test'
import * as assert from 'node:assert'
import * as fs from 'fs'
import * as path from 'path'

// Matches `from 'electron'`, `import 'electron'`, `import('electron')`, `require('electron')`
// and subpaths like 'electron/main'; the quote must sit right before "electron", so
// '@electron/...' packages and the bare word in comments do not match.
// ponytail: direct imports only; transitive imports (e.g. via ../types) are not followed.
// ../types is type-only today; follow the import graph if that ever changes.
const ELECTRON = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]electron(?:\/[^'"`]*)?['"`]/

const SRC = path.join(__dirname, '..', 'src')

function sources(dir: string): string[] {
  if (!fs.existsSync(dir)) return [] // src/cli does not exist until T201
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(f => /\.(ts|tsx|js)$/.test(f))
    .map(f => path.join(dir, f))
}

test('src/core and src/cli do not import electron', () => {
  const core = sources(path.join(SRC, 'core'))
  assert.ok(core.length > 0, 'scanned no files under src/core')
  const files = [...core, ...sources(path.join(SRC, 'cli'))]
  const offenders = files.filter(f => ELECTRON.test(fs.readFileSync(f, 'utf8')))
  assert.deepStrictEqual(offenders.map(f => path.relative(path.join(SRC, '..'), f)), [], 'files import electron')
})
