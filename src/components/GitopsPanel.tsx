/**
 * GitopsPanel — drift detection and config commit UI.
 * Compares running device config against intended-state files in a git repo.
 */
import React, { useState } from 'react'
import type { OpenTab } from '../types'

interface Props {
  activeTab?: OpenTab
  onClose: () => void
}

interface DiffLine {
  added?: boolean
  removed?: boolean
  value: string
}

export default function GitopsPanel({ activeTab, onClose }: Props) {
  const [runningConfig, setRunningConfig] = useState('')
  const [diff, setDiff]                   = useState<DiffLine[]>([])
  const [intendedFile, setIntendedFile]   = useState('')
  const [hasDrift, setHasDrift]           = useState<boolean | null>(null)
  const [commitMsg, setCommitMsg]         = useState('')
  const [status, setStatus]               = useState('')
  const [busy, setBusy]                   = useState(false)

  async function handlePull() {
    setBusy(true)
    setStatus('')
    try {
      const result = await window.api.gitops.pull()
      setStatus(`Pulled. ${result.files.length} file(s) updated.`)
    } catch (e: any) {
      setStatus(`Pull failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleDriftCheck() {
    if (!runningConfig.trim()) {
      setStatus('Paste the running config below first.')
      return
    }
    if (!activeTab) {
      setStatus('No active session selected.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const result = await window.api.gitops.driftCheck({
        sessionId: activeTab.sessionId,
        sessionName: activeTab.sessionName,
        runningConfig,
      })
      if (result.error) {
        setStatus(result.error)
        setDiff([])
        setHasDrift(null)
      } else {
        setDiff(result.diff ?? [])
        setHasDrift(result.hasDrift)
        setIntendedFile(result.intendedFile ?? '')
        setStatus(result.hasDrift
          ? `Drift detected: +${result.addedLines} / -${result.removedLines} lines`
          : 'No drift — running config matches intended state.')
      }
    } catch (e: any) {
      setStatus(`Drift check failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleCommit() {
    if (!commitMsg.trim()) { setStatus('Enter a commit message.'); return }
    setBusy(true)
    setStatus('')
    try {
      const result = await window.api.gitops.commit({
        message: commitMsg,
        files: intendedFile ? [intendedFile] : [],
      })
      setStatus(`Committed: ${result.commit}`)
      setCommitMsg('')
    } catch (e: any) {
      setStatus(`Commit failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 860, maxHeight: '90vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>GitOps Drift Detection</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left panel */}
          <div style={{ width: 340, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: 14, gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
              Session: <strong style={{ color: 'var(--fg)' }}>{activeTab?.sessionName ?? '(none)'}</strong>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePull} disabled={busy} style={actionBtn}>Pull Latest</button>
              <button onClick={handleDriftCheck} disabled={busy} style={{ ...actionBtn, background: '#1f6feb' }}>Check Drift</button>
            </div>

            <label style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
              Running Config (paste from device):
            </label>
            <textarea
              value={runningConfig}
              onChange={e => setRunningConfig(e.target.value)}
              rows={12}
              placeholder="Paste 'show running-config' output here…"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', padding: 6, fontSize: 11, fontFamily: 'monospace', resize: 'vertical', outline: 'none' }}
            />

            {intendedFile && (
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Intended: {intendedFile}</div>
            )}

            {hasDrift && (
              <>
                <input
                  value={commitMsg}
                  onChange={e => setCommitMsg(e.target.value)}
                  placeholder="Commit message…"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', padding: '5px 8px', fontSize: 12, outline: 'none' }}
                />
                <button onClick={handleCommit} disabled={busy} style={{ ...actionBtn, background: '#238636' }}>Commit Config</button>
              </>
            )}

            {status && (
              <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 4, background: 'var(--bg2)', color: hasDrift === false ? '#3fb950' : hasDrift ? '#f97583' : 'var(--fg)' }}>
                {status}
              </div>
            )}
          </div>

          {/* Right panel — diff */}
          <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
            {diff.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--fg-dim)' }}>Diff will appear here after running a check.</div>
            ) : (
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {diff.map((chunk, ci) =>
                    chunk.value.split('\n').filter((_, li, arr) => !(li === arr.length - 1 && _ === '')).map((line, li) => (
                      <tr key={`${ci}-${li}`} style={{
                        background: chunk.added ? '#0a3620' : chunk.removed ? '#3d0e0e' : 'transparent',
                      }}>
                        <td style={{ width: 18, textAlign: 'center', color: chunk.added ? '#3fb950' : chunk.removed ? '#f97583' : 'transparent', userSelect: 'none' }}>
                          {chunk.added ? '+' : chunk.removed ? '−' : ' '}
                        </td>
                        <td style={{ padding: '1px 10px', color: chunk.added ? '#3fb950' : chunk.removed ? '#f97583' : 'var(--fg)', whiteSpace: 'pre' }}>
                          {line}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--fg)', padding: '5px 12px', cursor: 'pointer', fontSize: 12,
}
