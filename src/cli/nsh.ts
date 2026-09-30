/**
 * nsh: NetShell's parsers as a CLI. Text in, one JSON line out.
 * The contract (commands, envelope, exit codes) is docs/adr/ADR-032-nsh-cli-contract.md.
 * No network, no store, no electron (ADR-032 §4, SC-003): only the files named on
 * the command line are read, and only stdout/stderr are written.
 */
import { parseArgs } from 'node:util'
import * as fs from 'fs'
import { parseInterfaces, parseBgp, parseArp, parseDevice } from '../core/normalize'
import { evaluateCheck } from '../core/compliance'
import { renderTemplate } from '../core/templates'
import { parseLldpNeighbors } from '../core/topology'
import type { Vendor, CompliancePolicy, ConfigTemplate } from '../types'

// Mirrors the Vendor union in src/types.ts; a type can't be checked at runtime.
const VENDORS: Vendor[] = ['ios', 'iosxe', 'iosxr', 'nxos', 'junos', 'eos', 'generic']

const USAGE = `usage:
  nsh normalize {interfaces|bgp|arp|device} --vendor V [FILE]
  nsh comply --policy P [--config F]
  nsh render --template T --vars V
  nsh topology lldp [FILE]
  nsh --help

Device text comes from FILE (or --config) if given, else stdin.
--vendor: ${VENDORS.join(', ')}
Exit: 0 ok, 1 comply found failures, 2 usage error, 3 input could not be parsed.
`

const PARSERS = { interfaces: parseInterfaces, bgp: parseBgp, arp: parseArp, device: parseDevice }

// Which flags each command accepts; anything else is a usage error.
const FLAGS: Record<string, string[]> = {
  normalize: ['vendor'],
  comply: ['policy', 'config'],
  render: ['template', 'vars'],
  topology: [],
}

// Own-key lookup for user-typed names: `in` would accept inherited keys like 'toString'.
// (Object.hasOwn needs lib es2022; tsconfig targets ES6.)
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

export interface Result { code: number, stdout: string, stderr: string }

// Thrown to stop with exit 2 (usage) or 3 (unparseable input); main turns it into a Result.
class Exit {
  constructor(public code: 2 | 3, public message: string) {}
}

const usage = (msg: string) => new Exit(2, msg)
const bad = (msg: string) => new Exit(3, msg)

function readNamed(file: string, flag: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (e: unknown) {
    throw usage(`cannot read ${flag} ${file}: ${(e as Error).message}`)
  }
}

function readJson(file: string, flag: string, what: string): unknown {
  const text = readNamed(file, flag)
  try {
    return JSON.parse(text)
  } catch (e: unknown) {
    throw bad(`${flag} ${file}: expected ${what} as JSON: ${(e as Error).message}`)
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Runs nsh with argv (without node and script) and returns what to print.
 * readStdin is only called when a command needs device text and no file was given.
 */
export function main(argv: string[], readStdin: () => string = () => fs.readFileSync(0, 'utf8')): Result {
  try {
    return run(argv, readStdin)
  } catch (e: unknown) {
    if (!(e instanceof Exit)) throw e
    return { code: e.code, stdout: '', stderr: `nsh: ${e.message}\n` + (e.code === 2 ? USAGE : '') }
  }
}

function run(argv: string[], readStdin: () => string): Result {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        vendor: { type: 'string' },
        policy: { type: 'string' },
        config: { type: 'string' },
        template: { type: 'string' },
        vars: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (e: unknown) {
    throw usage((e as Error).message.split('\n')[0])
  }
  const { values, positionals } = parsed
  if (values.help) return { code: 0, stdout: USAGE, stderr: '' }

  const [cmd, ...rest] = positionals
  if (!cmd) throw usage('missing command')
  if (!own(FLAGS, cmd)) throw usage(`unknown command '${cmd}'`)
  for (const flag of Object.keys(values)) {
    if (!FLAGS[cmd].includes(flag)) throw usage(`'${cmd}' does not take --${flag}`)
  }

  // Device text from the named file, else all of stdin. Passed to core unchanged
  // (no CRLF stripping) so the result matches the app path byte for byte.
  const deviceText = (file: string | undefined, flag: string, expected: string): string => {
    const text = file !== undefined ? readNamed(file, flag) : readStdin()
    if (!text.trim()) throw bad(`empty input: expected ${expected}`)
    return text
  }
  const maxArgs = (n: number) => {
    if (rest.length > n) throw usage(`unexpected argument '${rest[n]}'`)
  }
  const envelope = (command: string, vendor: string | null, data: unknown, code = 0): Result => ({
    code,
    stdout: JSON.stringify({ schema: 'nsh/1', command, vendor, data, warnings: [] }) + '\n',
    stderr: '',
  })

  if (cmd === 'normalize') {
    const [sub, file] = rest
    if (!sub) throw usage('missing normalize subcommand')
    if (!own(PARSERS, sub)) throw usage(`unknown normalize subcommand '${sub}'`)
    maxArgs(2)
    if (values.vendor === undefined) throw usage('missing --vendor')
    const vendor = values.vendor as Vendor
    if (!VENDORS.includes(vendor)) throw usage(`unknown --vendor '${values.vendor}'`)
    const expected = `${vendor} 'show ${sub === 'device' ? 'version' : sub}' output`
    const data = PARSERS[sub as keyof typeof PARSERS](deviceText(file, 'FILE', expected), vendor)
    // Text the parser cannot read is exit 3, never an empty success (spec.md User Story 1
    // scenario 3). Core returns [] or a bare {vendor} for it, so the CLI decides here;
    // this also makes a genuinely empty table exit 3 (ADR-032 open question 1).
    const empty = Array.isArray(data) ? data.length === 0 : Object.keys(data).length <= 1
    if (empty) throw bad(`nothing parsed: expected ${expected}`)
    return envelope(`normalize ${sub}`, vendor, data)
  }

  if (cmd === 'comply') {
    maxArgs(0)
    if (values.policy === undefined) throw usage('missing --policy')
    const policy = readJson(values.policy, '--policy', 'a CompliancePolicy')
    if (!isObject(policy) || !Array.isArray(policy.checks)) {
      throw bad(`--policy ${values.policy}: expected a CompliancePolicy object with a "checks" array`)
    }
    // Shape-check only the fields core reads, so a bad check is exit 3, not a TypeError (exit 1 = failures).
    policy.checks.forEach((c: unknown, i: number) => {
      const at = `--policy ${values.policy}: checks[${i}]`
      if (!isObject(c)) throw bad(`${at} must be an object`)
      for (const k of ['id', 'description']) {
        if (typeof c[k] !== 'string') throw bad(`${at}.${k} must be a string`)
      }
      for (const k of ['expectMatch', 'expectNoMatch']) {
        if (c[k] !== undefined && typeof c[k] !== 'string') throw bad(`${at}.${k} must be a string`)
      }
    })
    const text = deviceText(values.config, '--config', 'a running-config')
    // Every check runs against the whole config; check.command is ignored (ADR-032 open question 4).
    const data = (policy as unknown as CompliancePolicy).checks.map(c => evaluateCheck(c, text))
    return envelope('comply', null, data, data.some(r => r.status === 'fail') ? 1 : 0)
  }

  if (cmd === 'render') {
    maxArgs(0)
    if (values.template === undefined) throw usage('missing --template')
    if (values.vars === undefined) throw usage('missing --vars')
    const tmpl = readJson(values.template, '--template', 'a ConfigTemplate')
    const vars = readJson(values.vars, '--vars', 'an object of variable values')
    if (!isObject(tmpl) || typeof tmpl.template !== 'string' || !Array.isArray(tmpl.variables)) {
      throw bad(`--template ${values.template}: expected a ConfigTemplate with a string "template" and a "variables" array`)
    }
    tmpl.variables.forEach((v: unknown, i: number) => {
      const at = `--template ${values.template}: variables[${i}]`
      if (!isObject(v)) throw bad(`${at} must be an object`)
      if (typeof v.name !== 'string') throw bad(`${at}.name must be a string`)
    })
    if (!isObject(vars)) throw bad(`--vars ${values.vars}: expected a JSON object of variable values`)
    const t = tmpl as unknown as ConfigTemplate
    const out = renderTemplate(t, t.id ?? '', vars as Record<string, string | number | boolean>)
    if ('error' in out) throw bad(`render failed: ${out.error}`)
    return envelope('render', null, out)
  }

  // topology
  const [sub, file] = rest
  if (sub !== 'lldp') throw usage(sub ? `unknown topology subcommand '${sub}'` : 'missing topology subcommand')
  maxArgs(2)
  // LLDP only: no CDP fallback like the app's (ADR-032 open question 3).
  const { nodes, links } = parseLldpNeighbors(deviceText(file, 'FILE', "'show lldp neighbors detail' output"), 'local')
  if (nodes.length === 0) throw bad("no neighbors parsed: expected 'show lldp neighbors detail' output")
  // Core ids are random uuidv4, so the same input would print different bytes. Renumber
  // them n1.. / l1.. here (ADR-032 open question 2, spec edge case on determinism).
  const ids = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]))
  return envelope('topology lldp', null, {
    nodes: nodes.map(n => ({ ...n, id: ids.get(n.id) })),
    links: links.map((l, i) => ({ ...l, id: `l${i + 1}`, target: ids.get(l.target) ?? l.target })),
  })
}

if (require.main === module) {
  const r = main(process.argv.slice(2))
  process.stdout.write(r.stdout)
  process.stderr.write(r.stderr)
  process.exitCode = r.code
}
