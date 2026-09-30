/**
 * Compliance scanner — runs policy checks against live device sessions.
 * Ships with built-in CIS-inspired checks for IOS/NX-OS/JunOS/EOS.
 * Custom policies can be added and stored in the JSON store.
 */
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { CompliancePolicy, ComplianceResult } from '../../types'
import { load, save } from '../store'
import { BUILTIN_POLICIES, evaluateCheck } from '../../core/compliance'

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
