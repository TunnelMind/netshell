/**
 * Runs every fixture through the CURRENT pure logic in src/main/ipc and
 * returns { goldenFileName: value }. Shared by capture-golden.ts (writes
 * tests/golden/) and golden.test.ts (compares), so both see the same cases.
 */
import { handlers, store, commandOutput, resetUuid } from './helpers/fakes'
import * as fs from 'fs'
import * as path from 'path'
import { parseInterfaces, parseBgp, parseArp, parseDevice } from '../src/main/ipc/normalize'
import { evaluateCheck, BUILTIN_POLICIES } from '../src/main/ipc/compliance'
import { registerTemplateHandlers } from '../src/main/ipc/templates'
import { registerTopologyHandlers } from '../src/main/ipc/topology'
import { IPC } from '../src/types'
import type { Vendor } from '../src/types'

const FIX = path.join(__dirname, 'fixtures')
const read = (...p: string[]) => fs.readFileSync(path.join(FIX, ...p), 'utf8')
const VENDORS: Vendor[] = ['ios', 'nxos', 'junos', 'eos']

registerTemplateHandlers()
registerTopologyHandlers()

export async function captureAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}

  const parsers = { interfaces: parseInterfaces, bgp: parseBgp, arp: parseArp, device: parseDevice }
  for (const [name, fn] of Object.entries(parsers)) {
    const byVendor: Record<string, unknown> = {}
    for (const v of VENDORS) byVendor[v] = fn(read('normalize', name, `${v}.txt`), v)
    // Same IOS text with CRLF line endings, as a serial/telnet capture gives it.
    byVendor['ios-crlf'] = fn(read('normalize', name, 'ios.txt').replace(/\n/g, '\r\n'), 'ios')
    out[`normalize-${name}`] = byVendor
  }

  const compliance: Record<string, unknown> = {}
  for (const policy of BUILTIN_POLICIES) {
    const config = read('compliance', `${policy.vendor}.txt`)
    compliance[policy.id] = policy.checks.map(c => evaluateCheck(c, config))
  }
  out.compliance = compliance

  store.data = { templates: JSON.parse(read('templates', 'templates.json')) }
  const render = handlers.get(IPC.TEMPLATES_RENDER)
  const renderCases: [string, string, Record<string, unknown>][] = [
    ['defaults-only', 'tmpl-intf', {}],
    ['caller-override', 'tmpl-intf', { intf: 'Vlan100', ip: '192.0.2.1', shutdown: true, acl: 'MGMT-IN' }],
    ['undeclared-key-and-raw-chars', 'tmpl-intf', { desc: '<to core & edge>', extra: 'x', acl: 'A"B' }],
    ['syntax-error', 'tmpl-syntax-error', {}],
    ['include-no-loader', 'tmpl-include', { hostname: 'r1' }],
    ['not-found', 'no-such-template', {}],
  ]
  const templates: Record<string, unknown> = {}
  for (const [name, templateId, variables] of renderCases) {
    templates[name] = render({}, { templateId, variables })
  }
  out.templates = templates

  const discover = handlers.get(IPC.TOPOLOGY_LLDP_DISCOVER)
  const topoCases: [string, string, string][] = [
    ['lldp', read('topology', 'lldp-ios.txt'), ''],
    // LLDP output under 20 chars → the handler falls back to CDP.
    ['cdp-fallback', '', read('topology', 'cdp-ios.txt')],
    // 21 chars of error text is not "short", so it is parsed as LLDP (INVENTORY P2).
    ['lldp-error-text', '% LLDP is not enabled', read('topology', 'cdp-ios.txt')],
  ]
  const topology: Record<string, unknown> = {}
  for (const [name, lldp, cdp] of topoCases) {
    commandOutput['show lldp neighbors detail'] = lldp
    commandOutput['show cdp neighbors detail'] = cdp
    resetUuid()
    topology[name] = await discover({}, { connId: 'c1', connType: 'ssh', localNodeId: 'local-node' })
  }
  out.topology = topology

  return out
}

// JSON.stringify drops keys whose value is undefined, so a golden cannot tell
// "absent" from "undefined". That matches what crosses IPC and what the CLI prints.
export const serialize = (x: unknown): string => JSON.stringify(x, null, 2) + '\n'
export const GOLDEN = path.join(__dirname, 'golden')
