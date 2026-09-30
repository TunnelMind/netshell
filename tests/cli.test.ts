// T203: the CLI on the golden fixtures. Runs the real core (no fakes), so goldens are read as JSON.
import { test } from 'node:test'
import * as assert from 'node:assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { main } from '../src/cli/nsh'
import { BUILTIN_POLICIES } from '../src/core/compliance'

const ROOT = path.join(__dirname, '..')
const FIX = path.join(__dirname, 'fixtures')
const fix = (...p: string[]) => path.join(FIX, ...p)
const golden = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', `${name}.json`), 'utf8'))
const noStdin = () => { throw new Error('stdin read unexpectedly') }
const stdin = (text: string) => () => text

const SUBS = ['interfaces', 'bgp', 'arp', 'device']
const VENDORS = ['ios', 'nxos', 'junos', 'eos']

// Parses the one compact line, checks the envelope, and pins data to the golden
// including key order (deepStrictEqual ignores order; the spec wants deterministic bytes).
function assertEnvelope(r: { code: number, stdout: string, stderr: string }, command: string, vendor: string | null, want: unknown, code = 0) {
  assert.strictEqual(r.code, code, r.stderr)
  assert.strictEqual(r.stderr, '')
  assert.ok(r.stdout.endsWith('\n') && !r.stdout.slice(0, -1).includes('\n'), 'one JSON line')
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(Object.keys(out), ['schema', 'command', 'vendor', 'data', 'warnings'])
  assert.strictEqual(out.schema, 'nsh/1')
  assert.strictEqual(out.command, command)
  assert.strictEqual(out.vendor, vendor)
  assert.deepStrictEqual(out.warnings, [])
  assert.deepStrictEqual(out.data, want)
  assert.strictEqual(JSON.stringify(out.data), JSON.stringify(want))
}

function assertExit(r: { code: number, stdout: string, stderr: string }, code: 2 | 3) {
  assert.strictEqual(r.code, code, r.stderr)
  assert.strictEqual(r.stdout, '')
  assert.ok(r.stderr.startsWith('nsh:'), r.stderr)
}

// Core returns [] or a bare {vendor} for text it cannot read; the CLI turns that into exit 3.
const isEmpty = (v: unknown) => Array.isArray(v) ? v.length === 0 : Object.keys(v as object).length <= 1

function withTmp(fn: (write: (name: string, value: unknown) => string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nsh-test-'))
  try {
    fn((name, value) => {
      const p = path.join(dir, name)
      fs.writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value))
      return p
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('normalize: every sub × vendor equals its golden (file and stdin)', async (t) => {
  for (const sub of SUBS) {
    const g = golden(`normalize-${sub}`)
    for (const v of VENDORS) {
      await t.test(`${sub} ${v}`, () => {
        const file = fix('normalize', sub, `${v}.txt`)
        const runs = [
          main(['normalize', sub, '--vendor', v, file], noStdin),
          main(['normalize', sub, '--vendor', v], stdin(fs.readFileSync(file, 'utf8'))),
        ]
        for (const r of runs) {
          if (isEmpty(g[v])) assertExit(r, 3)
          else assertEnvelope(r, `normalize ${sub}`, v, g[v])
        }
      })
    }
  }
})

test('normalize: CRLF input equals the ios-crlf golden', async (t) => {
  for (const sub of SUBS) {
    await t.test(sub, () => {
      const text = fs.readFileSync(fix('normalize', sub, 'ios.txt'), 'utf8').replace(/\n/g, '\r\n')
      assertEnvelope(main(['normalize', sub, '--vendor', 'ios'], stdin(text)), `normalize ${sub}`, 'ios', golden(`normalize-${sub}`)['ios-crlf'])
    })
  }
})

test('comply: every builtin policy equals its golden, exit 1 iff a check fails', async (t) => {
  const g = golden('compliance')
  const codes: number[] = []
  for (const policy of BUILTIN_POLICIES) {
    await t.test(policy.id, () => withTmp(write => {
      const p = write('policy.json', policy)
      const config = fix('compliance', `${policy.vendor}.txt`)
      const code = g[policy.id].some((r: { status: string }) => r.status === 'fail') ? 1 : 0
      codes.push(code)
      assertEnvelope(main(['comply', '--policy', p, '--config', config], noStdin), 'comply', null, g[policy.id], code)
      assertEnvelope(main(['comply', '--policy', p], stdin(fs.readFileSync(config, 'utf8'))), 'comply', null, g[policy.id], code)
    }))
  }
  assert.ok(codes.includes(1), 'no policy exercised exit 1')
})

// Golden 'not-found' is skipped: the CLI takes the template as a file, so there is no id to miss
// (a missing --template file is a usage error, covered below).
test('render: golden cases through template and vars files', async (t) => {
  const g = golden('templates')
  const tmpls = JSON.parse(fs.readFileSync(fix('templates', 'templates.json'), 'utf8'))
  const byId = (id: string) => tmpls.find((x: { id: string }) => x.id === id)
  const cases: [string, string, Record<string, unknown>][] = [
    ['defaults-only', 'tmpl-intf', {}],
    ['caller-override', 'tmpl-intf', { intf: 'Vlan100', ip: '192.0.2.1', shutdown: true, acl: 'MGMT-IN' }],
    ['undeclared-key-and-raw-chars', 'tmpl-intf', { desc: '<to core & edge>', extra: 'x', acl: 'A"B' }],
    ['syntax-error', 'tmpl-syntax-error', {}],
    ['include-no-loader', 'tmpl-include', { hostname: 'r1' }],
  ]
  for (const [name, id, vars] of cases) {
    await t.test(name, () => withTmp(write => {
      const r = main(['render', '--template', write('t.json', byId(id)), '--vars', write('v.json', vars)], noStdin)
      // Golden errors are core's { error }; the CLI reports them as exit 3.
      if ('error' in g[name]) {
        assertExit(r, 3)
        assert.ok(r.stderr.includes(g[name].error), r.stderr)
      } else {
        assertEnvelope(r, 'render', null, g[name])
      }
    }))
  }
})

test('topology lldp equals the golden after id renumbering, byte-identical on repeat', () => {
  const g = golden('topology').lldp
  const ids = new Map<string, string>(g.nodes.map((n: { id: string }, i: number) => [n.id, `n${i + 1}`]))
  const want = {
    nodes: g.nodes.map((n: { id: string }) => ({ ...n, id: ids.get(n.id) })),
    links: g.links.map((l: { target: string, source: string }, i: number) => ({
      ...l, id: `l${i + 1}`, source: l.source === 'local-node' ? 'local' : l.source, target: ids.get(l.target) ?? l.target,
    })),
  }
  const file = fix('topology', 'lldp-ios.txt')
  const a = main(['topology', 'lldp', file], noStdin)
  assertEnvelope(a, 'topology lldp', null, want)
  assert.strictEqual(main(['topology', 'lldp', file], noStdin).stdout, a.stdout)
  // No CDP fallback in the CLI (ADR-032 OQ3): LLDP error text parses to nothing.
  assertExit(main(['topology', 'lldp'], stdin('% LLDP is not enabled')), 3)
})

test('usage errors exit 2 with empty stdout', async (t) => {
  const iface = fix('normalize', 'interfaces', 'ios.txt')
  const cases: [string, string[]][] = [
    ['unknown vendor', ['normalize', 'interfaces', '--vendor', 'cisco', iface]],
    ['unknown command', ['frobnicate']],
    ['missing --vendor', ['normalize', 'interfaces', iface]],
    ['flag the command does not take', ['comply', '--vendor', 'ios']],
    ['toString as command', ['toString']],
    ['toString as normalize sub', ['normalize', 'toString', '--vendor', 'ios', iface]],
    ['missing --policy file', ['comply', '--policy', path.join(os.tmpdir(), 'nsh-no-such-policy.json'), '--config', iface]],
  ]
  for (const [name, argv] of cases) {
    await t.test(name, () => assertExit(main(argv, noStdin), 2))
  }
})

test('unparseable input exits 3 with empty stdout', async (t) => {
  await t.test('empty stdin', () => assertExit(main(['normalize', 'interfaces', '--vendor', 'ios'], stdin('')), 3))
  await t.test('whitespace-only stdin', () => assertExit(main(['normalize', 'interfaces', '--vendor', 'ios'], stdin(' \r\n\t\n')), 3))
  await t.test('policy file is not JSON', () => withTmp(write => {
    const p = write('bad.json', '{ not json')
    assertExit(main(['comply', '--policy', p, '--config', fix('compliance', 'ios.txt')], noStdin), 3)
  }))
  // R001: malformed checks/variables are exit 3 naming the field, never a TypeError.
  const check = { id: 'x', description: 'd' }
  const badPolicies: [string, unknown, string][] = [
    ['checks:[null]', { checks: [null] }, 'checks[0] must be an object'],
    ['numeric check id', { checks: [check, { ...check, id: 1 }] }, 'checks[1].id'],
    ['numeric description', { checks: [{ ...check, description: 2 }] }, 'checks[0].description'],
    ['numeric expectMatch', { checks: [{ ...check, expectMatch: 5 }] }, 'checks[0].expectMatch'],
    ['object expectNoMatch', { checks: [{ ...check, expectNoMatch: {} }] }, 'checks[0].expectNoMatch'],
  ]
  for (const [name, policy, field] of badPolicies) {
    await t.test(name, () => withTmp(write => {
      const r = main(['comply', '--policy', write('p.json', policy), '--config', fix('compliance', 'ios.txt')], noStdin)
      assertExit(r, 3)
      assert.ok(r.stderr.includes(field), r.stderr)
    }))
  }
  const badTemplates: [string, unknown, string][] = [
    ['variables:[null]', [null], 'variables[0] must be an object'],
    ['numeric variable name', [{ name: 7 }], 'variables[0].name'],
  ]
  for (const [name, variables, field] of badTemplates) {
    await t.test(name, () => withTmp(write => {
      const r = main(['render', '--template', write('t.json', { template: 'x', variables }), '--vars', write('v.json', {})], noStdin)
      assertExit(r, 3)
      assert.ok(r.stderr.includes(field), r.stderr)
    }))
  }
  await t.test('check with neither expectMatch nor expectNoMatch still passes', () => withTmp(write => {
    const r = main(['comply', '--policy', write('p.json', { checks: [check] }), '--config', fix('compliance', 'ios.txt')], noStdin)
    assert.strictEqual(r.code, 0, r.stderr)
    assert.strictEqual(JSON.parse(r.stdout).data[0].status, 'pass')
  }))
})

// Smoke bound only; SC-002 timing evidence is T204's.
test('5 MB input completes', (t) => {
  const one = fs.readFileSync(fix('normalize', 'interfaces', 'ios.txt'), 'utf8')
  const perCopy = golden('normalize-interfaces').ios.length
  const n = Math.ceil(5 * 1024 * 1024 / Buffer.byteLength(one))
  const big = one.endsWith('\n') ? one.repeat(n) : (one + '\n').repeat(n)
  assert.ok(Buffer.byteLength(big) >= 5 * 1024 * 1024)
  const start = Date.now()
  const r = main(['normalize', 'interfaces', '--vendor', 'ios'], stdin(big))
  const ms = Date.now() - start
  t.diagnostic(`${n} copies, ${(Buffer.byteLength(big) / 1048576).toFixed(1)} MB in ${ms} ms`)
  assert.strictEqual(r.code, 0, r.stderr)
  // The parser does not dedupe: every copy yields its rows again.
  assert.strictEqual(JSON.parse(r.stdout).data.length, n * perCopy)
  assert.ok(ms < 10000, `took ${ms} ms`)
})

test('real process: require.main wires stdout, stderr and exit code', () => {
  const run = (args: string[], input?: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/nsh.ts', ...args], { cwd: ROOT, input, encoding: 'utf8' })
  const ok = run(['normalize', 'interfaces', '--vendor', 'ios', fix('normalize', 'interfaces', 'ios.txt')])
  assert.strictEqual(ok.status, 0, ok.stderr)
  assert.strictEqual(JSON.parse(ok.stdout).command, 'normalize interfaces')
  const empty = run(['normalize', 'interfaces', '--vendor', 'ios'], '')
  assert.strictEqual(empty.status, 3)
  assert.strictEqual(empty.stdout, '')
  assert.ok(empty.stderr.startsWith('nsh:'), empty.stderr)
})

test('unreadable stdin is exit 3 with one line, no stack trace', () => {
  const r = main(['normalize', 'interfaces', '--vendor', 'ios'], () => {
    throw Object.assign(new Error('EISDIR: illegal operation on a directory, read'), { code: 'EISDIR' })
  })
  assertExit(r, 3)
  assert.ok(r.stderr.includes('stdin'), r.stderr)
  assert.ok(!r.stderr.includes('\n    at '), r.stderr)
})

test('real process: stdin is a directory', () => {
  const fd = fs.openSync(os.tmpdir(), 'r')
  try {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/nsh.ts', 'normalize', 'interfaces', '--vendor', 'ios'],
      { cwd: ROOT, stdio: [fd, 'pipe', 'pipe'], encoding: 'utf8' })
    assert.strictEqual(r.status, 3, r.stderr)
    assert.strictEqual(r.stdout, '')
    assert.ok(r.stderr.startsWith('nsh:') && r.stderr.includes('stdin'), r.stderr)
    assert.ok(!r.stderr.includes('    at '), r.stderr)
  } finally {
    fs.closeSync(fd)
  }
})

test('real process: closed stdout (EPIPE) exits 0 quietly', () => withTmp(write => {
  // Output must dwarf the pipe buffer (64 KB) or the write may finish before head closes.
  const one = fs.readFileSync(fix('normalize', 'interfaces', 'ios.txt'), 'utf8')
  const n = Math.ceil(1024 * 1024 / Buffer.byteLength(one))
  const big = write('big.txt', one.endsWith('\n') ? one.repeat(n) : (one + '\n').repeat(n))
  const r = spawnSync('bash', ['-c',
    `set -o pipefail; "${process.execPath}" --import tsx src/cli/nsh.ts normalize interfaces --vendor ios < "${big}" | head -c0`],
  { cwd: ROOT, encoding: 'utf8' })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stderr, '')
}))
