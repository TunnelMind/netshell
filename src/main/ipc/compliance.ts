/**
 * Compliance scanner — runs policy checks against live device sessions.
 * Ships with built-in CIS-inspired checks for IOS/NX-OS/JunOS/EOS.
 * Custom policies can be added and stored in the JSON store.
 */
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { CompliancePolicy, ComplianceCheck, ComplianceResult } from '../../types'
import { load, save } from '../store'

// ─── Built-in CIS-inspired policies ──────────────────────────────────────────

const BUILTIN_IOS: CompliancePolicy = {
  id: 'builtin-ios-cis',
  name: 'CIS Cisco IOS Baseline',
  vendor: 'ios',
  description: 'CIS-inspired security checks for Cisco IOS/IOS-XE',
  builtin: true,
  checks: [
    { id: 'ios-1', description: 'SSH v2 enabled', command: 'show ip ssh', expectMatch: 'SSH Enabled.*version 2', severity: 'critical' },
    { id: 'ios-2', description: 'Telnet disabled on VTYs', command: 'show run | section line vty', expectNoMatch: 'transport input telnet', severity: 'high', remediation: 'line vty 0 15\n transport input ssh' },
    { id: 'ios-3', description: 'VTY exec-timeout set', command: 'show run | section line vty', expectMatch: 'exec-timeout', severity: 'high', remediation: 'line vty 0 15\n exec-timeout 5 0' },
    { id: 'ios-4', description: 'Console exec-timeout set', command: 'show run | section line con', expectMatch: 'exec-timeout', severity: 'medium', remediation: 'line con 0\n exec-timeout 5 0' },
    { id: 'ios-5', description: 'Password encryption enabled', command: 'show run | include service password', expectMatch: 'service password-encryption', severity: 'high', remediation: 'service password-encryption' },
    { id: 'ios-6', description: 'Enable secret set (not enable password)', command: 'show run | include enable', expectMatch: 'enable secret', severity: 'critical', remediation: 'enable algorithm-type sha256 secret <password>' },
    { id: 'ios-7', description: 'AAA new-model enabled', command: 'show run | include aaa', expectMatch: 'aaa new-model', severity: 'high', remediation: 'aaa new-model' },
    { id: 'ios-8', description: 'NTP configured', command: 'show ntp status', expectMatch: 'Clock is|synchroni', severity: 'medium', remediation: 'ntp server <ntp-server>' },
    { id: 'ios-9', description: 'Logging enabled', command: 'show run | include logging', expectMatch: 'logging (host|trap)', severity: 'medium' },
    { id: 'ios-10', description: 'SNMP v3 only (not v1/v2c)', command: 'show run | include snmp', expectNoMatch: 'snmp-server community', severity: 'high', remediation: 'Remove snmp-server community, configure SNMP v3' },
    { id: 'ios-11', description: 'CDP disabled on external interfaces', command: 'show cdp', expectMatch: 'CDP is not enabled|disabled', severity: 'low' },
    { id: 'ios-12', description: 'HTTP server disabled', command: 'show run | include ip http server', expectNoMatch: 'ip http server$', severity: 'high', remediation: 'no ip http server\nno ip http secure-server' },
  ],
}

const BUILTIN_NXOS: CompliancePolicy = {
  id: 'builtin-nxos-cis',
  name: 'CIS Cisco NX-OS Baseline',
  vendor: 'nxos',
  description: 'CIS-inspired security checks for Cisco NX-OS',
  builtin: true,
  checks: [
    { id: 'nx-1', description: 'SSH enabled', command: 'show ssh server', expectMatch: 'ssh enabled|SSH is enabled', severity: 'critical' },
    { id: 'nx-2', description: 'Telnet disabled', command: 'show feature | include telnet', expectNoMatch: 'telnet.*enabled', severity: 'high', remediation: 'no feature telnet' },
    { id: 'nx-3', description: 'NTP configured', command: 'show ntp status', expectMatch: 'synchroni', severity: 'medium' },
    { id: 'nx-4', description: 'AAA configured', command: 'show run | include aaa', expectMatch: 'aaa', severity: 'high' },
    { id: 'nx-5', description: 'SNMP v3 configured', command: 'show snmp user', expectMatch: 'auth|priv', severity: 'high' },
    { id: 'nx-6', description: 'Password strength check enabled', command: 'show run | include password strength', expectMatch: 'password strength-check', severity: 'medium', remediation: 'password strength-check' },
  ],
}

const BUILTIN_JUNOS: CompliancePolicy = {
  id: 'builtin-junos-cis',
  name: 'CIS Juniper JunOS Baseline',
  vendor: 'junos',
  description: 'CIS-inspired security checks for Juniper JunOS',
  builtin: true,
  checks: [
    { id: 'ju-1', description: 'SSH enabled', command: 'show system services ssh', expectMatch: 'SSH|Version', severity: 'critical' },
    { id: 'ju-2', description: 'Telnet disabled', command: 'show system services', expectNoMatch: 'telnet', severity: 'high' },
    { id: 'ju-3', description: 'NTP servers configured', command: 'show ntp associations', expectMatch: '\\+|\\*', severity: 'medium' },
    { id: 'ju-4', description: 'RADIUS/TACACS authentication', command: 'show system radius-server', expectMatch: '\\d+\\.\\d+', severity: 'high' },
    { id: 'ju-5', description: 'Syslog configured', command: 'show log messages | count', expectMatch: '[1-9]', severity: 'medium' },
  ],
}

const BUILTIN_EOS: CompliancePolicy = {
  id: 'builtin-eos-cis',
  name: 'CIS Arista EOS Baseline',
  vendor: 'eos',
  description: 'CIS-inspired security checks for Arista EOS',
  builtin: true,
  checks: [
    { id: 'eos-1', description: 'SSH enabled', command: 'show management ssh', expectMatch: 'SSH is|enabled', severity: 'critical' },
    { id: 'eos-2', description: 'Telnet disabled', command: 'show management telnet', expectMatch: 'disabled|Telnet is not', severity: 'high' },
    { id: 'eos-3', description: 'AAA configured', command: 'show aaa', expectMatch: 'tacacs|radius|local', severity: 'high' },
    { id: 'eos-4', description: 'NTP configured', command: 'show ntp status', expectMatch: 'synchroni', severity: 'medium' },
    { id: 'eos-5', description: 'IP HTTP server disabled', command: 'show management api http-commands', expectNoMatch: 'shutdown.*No', severity: 'high' },
  ],
}

export const BUILTIN_POLICIES = [BUILTIN_IOS, BUILTIN_NXOS, BUILTIN_JUNOS, BUILTIN_EOS]

// ─── IPC handlers ────────────────────────────────────────────────────────────

export function registerComplianceHandlers(): void {
  ipcMain.handle(IPC.COMPLIANCE_POLICIES_GET_ALL, () => {
    const data = load()
    return [...BUILTIN_POLICIES, ...data.compliancePolicies]
  })

  ipcMain.handle(IPC.COMPLIANCE_POLICIES_SAVE, (_event, policy: CompliancePolicy) => {
    const data = load()
    if (!policy.id) policy.id = uuidv4()
    const idx = data.compliancePolicies.findIndex(p => p.id === policy.id)
    if (idx >= 0) data.compliancePolicies[idx] = policy
    else data.compliancePolicies.push(policy)
    save(data)
    return policy
  })

  ipcMain.handle(IPC.COMPLIANCE_POLICIES_DELETE, (_event, id: string) => {
    const data = load()
    data.compliancePolicies = data.compliancePolicies.filter(p => p.id !== id)
    save(data)
  })

  ipcMain.handle(IPC.COMPLIANCE_RUN, async (event, params: {
    runId: string
    policyId: string
    connId: string
    connType: string
    sessionId: string
    sessionName: string
  }) => {
    const allPolicies = [...BUILTIN_POLICIES, ...load().compliancePolicies]
    const policy = allPolicies.find(p => p.id === params.policyId)
    if (!policy) throw new Error(`Policy ${params.policyId} not found`)

    const results: ComplianceResult[] = []

    for (const check of policy.checks) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.COMPLIANCE_PROGRESS, { runId: params.runId, checkId: check.id, status: 'running' })
      }

      try {
        // Run command via the appropriate transport write handler
        const output = await runCommandGetOutput(params.connId, params.connType, check.command)
        const result = evaluateCheck(check, output)
        results.push(result)
      } catch (e: unknown) {
        results.push({
          checkId: check.id,
          description: check.description,
          severity: check.severity,
          status: 'error',
          output: (e as Error).message,
          remediation: check.remediation,
        })
      }

      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.COMPLIANCE_PROGRESS, {
          runId: params.runId,
          checkId: check.id,
          status: results[results.length - 1].status,
        })
      }
    }

    const scanResult = {
      policyId: policy.id,
      policyName: policy.name,
      sessionId: params.sessionId,
      sessionName: params.sessionName,
      ts: Date.now(),
      results,
      passCount: results.filter(r => r.status === 'pass').length,
      failCount: results.filter(r => r.status === 'fail').length,
      criticalCount: results.filter(r => r.status === 'fail' && r.severity === 'critical').length,
    }

    if (!event.sender.isDestroyed()) event.sender.send(IPC.COMPLIANCE_DONE, params.runId, scanResult)
    return scanResult
  })
}

function evaluateCheck(check: ComplianceCheck, output: string): ComplianceResult {
  let status: 'pass' | 'fail' = 'pass'

  if (check.expectMatch) {
    try {
      const re = new RegExp(check.expectMatch, 'i')
      if (!re.test(output)) status = 'fail'
    } catch {
      status = 'fail' // invalid regex = treat as no match
    }
  }
  if (check.expectNoMatch) {
    try {
      const re = new RegExp(check.expectNoMatch, 'i')
      if (re.test(output)) status = 'fail'
    } catch {
      // invalid regex = treat as no match, so no failure
    }
  }

  return {
    checkId: check.id,
    description: check.description,
    severity: check.severity,
    status,
    output: output.slice(0, 500),
    remediation: status === 'fail' ? check.remediation : undefined,
  }
}

export async function runCommandGetOutput(connId: string, connType: string, command: string): Promise<string> {
  const { addDataListener } = await import('./dataListeners')
  const { ipcMain } = await import('electron')

  const writeChannel = connType === 'ssh' ? IPC.SSH_WRITE
    : connType === 'serial' ? IPC.SERIAL_WRITE
    : IPC.TELNET_WRITE

  // Write command — use emit() to dispatch to the handle()-registered handler.
  // This relies on Electron's ipcMain.handle() adding to the EventEmitter listeners;
  // the same pattern is used in broadcast.ts.
  ipcMain.emit(writeChannel, { sender: { isDestroyed: () => false } } as any, connId, command + '\r')

  // Collect output for 3 seconds then resolve
  return new Promise((resolve) => {
    let output = ''
    const unsubscribe = addDataListener(connId, (chunk) => { output += chunk })
    const timer = setTimeout(() => { unsubscribe(); resolve(output) }, 3000)
    // Suppress unused-variable warning — timer is used for its side-effect
    void timer
  })
}
