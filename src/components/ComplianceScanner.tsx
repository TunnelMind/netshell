/**
 * ComplianceScanner — CIS-inspired policy runner.
 * Runs compliance checks against a live device session and shows pass/fail results.
 */
import React, { useEffect, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { OpenTab, CompliancePolicy, ComplianceResult, ComplianceScanResult } from '../types'

interface Props {
  activeTab?: OpenTab
  onClose: () => void
}

type CheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'error'

interface CheckRow {
  checkId: string
  description: string
  severity: ComplianceResult['severity']
  status: CheckStatus
  output?: string
  remediation?: string
}

export default function ComplianceScanner({ activeTab, onClose }: Props) {
  const [policies, setPolicies] = useState<CompliancePolicy[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [rows, setRows]         = useState<CheckRow[]>([])
  const [scanResult, setScanResult] = useState<ComplianceScanResult | null>(null)
  const [running, setRunning]   = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const runIdRef = useRef<string>('')
  const unsubsRef = useRef<(() => void)[]>([])

  useEffect(() => {
    window.api.compliance.getPolicies().then(ps => {
      setPolicies(ps)
      if (ps.length > 0) setSelectedId(ps[0].id)
    })
    return () => { unsubsRef.current.forEach(f => f()) }
  }, [])

  async function handleRun() {
    if (!activeTab?.connId || !selectedId) return
    setRunning(true)
    setScanResult(null)

    const policy = policies.find(p => p.id === selectedId)
    if (!policy) return

    // Init rows
    setRows(policy.checks.map(c => ({
      checkId: c.id, description: c.description, severity: c.severity, status: 'pending',
    })))

    const runId = uuidv4()
    runIdRef.current = runId

    unsubsRef.current.forEach(f => f())
    const offProgress = window.api.compliance.onProgress(({ runId: rid, checkId, status }) => {
      if (rid !== runId) return
      setRows(prev => prev.map(r => r.checkId === checkId
        ? { ...r, status: status as CheckStatus }
        : r
      ))
    })
    const offDone = window.api.compliance.onDone((rid, result) => {
      if (rid !== runId) return
      setScanResult(result)
      setRows(result.results.map(r => ({
        checkId: r.checkId, description: r.description, severity: r.severity,
        status: r.status as CheckStatus, output: r.output, remediation: r.remediation,
      })))
      setRunning(false)
    })
    unsubsRef.current = [offProgress, offDone]

    try {
      await window.api.compliance.run({
        runId,
        policyId: selectedId,
        connId: activeTab.connId,
        connType: activeTab.sessionType,
        sessionId: activeTab.sessionId,
        sessionName: activeTab.sessionName,
      })
    } catch {
      setRunning(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const sevColor = (s: ComplianceResult['severity']) =>
    s === 'critical' ? '#f97583' : s === 'high' ? '#e3b341' : s === 'medium' ? '#79c0ff' : 'var(--fg-dim)'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 820, maxHeight: '90vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Compliance Scanner</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', padding: '5px 8px', fontSize: 13, flex: 1 }}
          >
            {policies.map(p => (
              <option key={p.id} value={p.id}>{p.name} {p.builtin ? '(built-in)' : ''}</option>
            ))}
          </select>

          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
            Session: <strong style={{ color: 'var(--fg)' }}>{activeTab?.sessionName ?? '(none)'}</strong>
          </span>

          <button
            onClick={handleRun}
            disabled={running || !activeTab?.connId || !selectedId}
            style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 16px', cursor: 'pointer', fontSize: 13 }}
          >
            {running ? 'Running…' : 'Run Scan'}
          </button>
        </div>

        {/* Summary bar */}
        {scanResult && (
          <div style={{ display: 'flex', gap: 16, padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', fontSize: 13 }}>
            <span style={{ color: '#3fb950' }}>✓ {scanResult.passCount} passed</span>
            <span style={{ color: '#f97583' }}>✗ {scanResult.failCount} failed</span>
            {scanResult.criticalCount > 0 && (
              <span style={{ color: '#f97583', fontWeight: 700 }}>⚠ {scanResult.criticalCount} critical</span>
            )}
          </div>
        )}

        {/* Results table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--fg-dim)', fontSize: 13 }}>
              Select a policy and click Run Scan.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg2)' }}>
                  <th style={th}>Check</th>
                  <th style={{ ...th, width: 80 }}>Severity</th>
                  <th style={{ ...th, width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <React.Fragment key={row.checkId}>
                    <tr
                      onClick={() => (row.output || row.remediation) && toggleExpand(row.checkId)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: (row.output || row.remediation) ? 'pointer' : 'default' }}
                    >
                      <td style={{ padding: '6px 14px' }}>{row.description}</td>
                      <td style={{ padding: '6px 14px', color: sevColor(row.severity), fontWeight: 600 }}>{row.severity}</td>
                      <td style={{ padding: '6px 14px' }}>
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                    {expanded.has(row.checkId) && (
                      <tr>
                        <td colSpan={3} style={{ padding: '4px 14px 10px', background: '#0a0a0a' }}>
                          {row.output && (
                            <pre style={{ margin: '4px 0', fontSize: 11, color: 'var(--fg-dim)', maxHeight: 100, overflow: 'auto' }}>
                              {row.output}
                            </pre>
                          )}
                          {row.remediation && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ color: '#e3b341', fontSize: 11 }}>Remediation: </span>
                              <code style={{ fontSize: 11, color: '#79c0ff' }}>{row.remediation}</code>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, { label: string; color: string }> = {
    pending: { label: '—',        color: 'var(--fg-dim)' },
    running: { label: '▶ running', color: '#79c0ff' },
    pass:    { label: '✓ pass',    color: '#3fb950' },
    fail:    { label: '✗ fail',    color: '#f97583' },
    error:   { label: '! error',   color: '#e3b341' },
  }
  const { label, color } = map[status] ?? map.pending
  return <span style={{ color, fontWeight: 600 }}>{label}</span>
}

const th: React.CSSProperties = {
  padding: '6px 14px', textAlign: 'left', color: 'var(--fg-dim)',
  fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
}
