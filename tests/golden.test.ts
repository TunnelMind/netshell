// Pins current behaviour (quirks included) before the logic moves to src/core.
import { test } from 'node:test'
import * as assert from 'node:assert'
import * as fs from 'fs'
import * as path from 'path'
import { captureAll, serialize, GOLDEN } from './capture'

test('golden outputs match current behaviour', async (t) => {
  const all = await captureAll()
  assert.deepStrictEqual(Object.keys(all).sort(), fs.readdirSync(GOLDEN).map(f => f.replace(/\.json$/, '')).sort())
  for (const [name, value] of Object.entries(all)) {
    await t.test(name, () => {
      assert.strictEqual(serialize(value), fs.readFileSync(path.join(GOLDEN, `${name}.json`), 'utf8'))
    })
  }
})
