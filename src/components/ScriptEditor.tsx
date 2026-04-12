import React, { useState, useEffect } from 'react'
import type { Script, ScriptStep, ScriptProgress, OpenTab } from '../types'

interface Props {
  tabs: OpenTab[]
  onClose: () => void
}

const EMPTY_SCRIPT: Omit<Script, 'id'> = {
  name: '',
  steps: [{ send: '', expect: '', timeoutMs: 10000 }],
  schedule: '',
}

type StepStatus = 'waiting' | 'running' | 'passed' | 'failed' | 'timeout'

interface RunState {
  runId: string
  stepStatuses: StepStatus[]
  stepOutputs: string[]
  done: boolean
  success: boolean
}

export default function ScriptEditor({ tabs, onClose }: Props) {
  const [scripts, setScripts] = useState<Script[]>([])
  const [selected, setSelected] = useState<Script | null>(null)
  const [form, setForm] = useState<Omit<Script, 'id'>>(EMPTY_SCRIPT)
  const [runState, setRunState] = useState<RunState | null>(null)
  const [targetConnId, setTargetConnId] = useState('')
  const [targetConnType, setTargetConnType] = useState('')

  const connectedTabs = tabs.filter(t => t.status === 'connected' && t.connId)

  useEffect(() => {
    window.api.scripts.getAll().then(setScripts).catch(() => {})
  }, [])

  // Subscribe to script runner events
  useEffect(() => {
    const unProgress = window.api.scripts.onProgress((p: ScriptProgress) => {
      setRunState(prev => {
        if (!prev || prev.runId !== p.runId) return prev
        const statuses = [...prev.stepStatuses]
        const outputs = [...prev.stepOutputs]
        statuses[p.stepIndex] = p.status as StepStatus
        if (p.output) outputs[p.stepIndex] = p.output
        return { ...prev, stepStatuses: statuses, stepOutputs: outputs }
      })
    })
    const unDone = window.api.scripts.onDone((runId: string, success: boolean) => {
      setRunState(prev => prev?.runId === runId ? { ...prev, done: true, success } : prev)
    })
    return () => { unProgress(); unDone() }
  }, [])

  const selectScript = (s: Script) => {
    setSelected(s)
    setForm({ name: s.name, steps: s.steps.map(st => ({ ...st })), schedule: s.schedule ?? '' })
    setRunState(null)
  }

  const newScript = () => {
    setSelected(null)
    setForm(EMPTY_SCRIPT)
    setRunState(null)
  }

  const setStep = (i: number, patch: Partial<ScriptStep>) => {
    setForm(prev => {
      const steps = prev.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s)
      return { ...prev, steps }
    })
  }

  const addStep = () => setForm(prev => ({
    ...prev,
    steps: [...prev.steps, { send: '', expect: '', timeoutMs: 10000 }],
  }))

  const removeStep = (i: number) => setForm(prev => ({
    ...prev,
    steps: prev.steps.filter((_, idx) => idx !== i),
  }))

  const save = async () => {
    if (!form.name.trim()) return
    const script = await window.api.scripts.save({ ...form, id: selected?.id ?? '' } as Script)
    setScripts(prev => {
      const idx = prev.findIndex(s => s.id === script.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = script; return n }
      return [...prev, script]
    })
    setSelected(script)
  }

  const del = async () => {
    if (!selected) return
    if (!confirm(`Delete script "${selected.name}"?`)) return
    await window.api.scripts.delete(selected.id)
    setScripts(prev => prev.filter(s => s.id !== selected.id))
    setSelected(null)
    setForm(EMPTY_SCRIPT)
  }

  const runScript = async () => {
    if (!selected || !targetConnId) return
    const runId = `run-${Date.now()}`
    const statuses: StepStatus[] = form.steps.map(() => 'waiting')
    setRunState({ runId, stepStatuses: statuses, stepOutputs: Array(form.steps.length).fill(''), done: false, success: false })
    await window.api.scripts.run({ runId, scriptId: selected.id, connId: targetConnId, connType: targetConnType, variables: {} })
  }

  const cancelScript = async () => {
    if (runState) {
      await window.api.scripts.cancel(runState.runId)
    }
  }

  const stepStatusIcon = (s: StepStatus) => {
    if (s === 'waiting')  return <span style={{ color: 'var(--text-dim)' }}>⏳</span>
    if (s === 'running')  return <span style={{ color: 'var(--accent)' }}>▶</span>
    if (s === 'passed')   return <span style={{ color: 'var(--green)' }}>✓</span>
    if (s === 'failed')   return <span style={{ color: 'var(--red)' }}>✗</span>
    if (s === 'timeout')  return <span style={{ color: 'var(--amber)' }}>⏱</span>
    return null
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, width: 720, height: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>Script Runner</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 16 }}>✕</button>
        </div>

        {/* Body: two panels */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: script list */}
          <div style={{ width: 200, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <button onClick={newScript} style={{
                width: '100%', background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 4, padding: '4px 0', fontSize: 11,
              }}>+ New Script</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {scripts.length === 0 && (
                <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>No scripts yet</div>
              )}
              {scripts.map(s => (
                <div
                  key={s.id}
                  onClick={() => selectScript(s)}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                    background: selected?.id === s.id ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: `2px solid ${selected?.id === s.id ? 'var(--accent)' : 'transparent'}`,
                    color: selected?.id === s.id ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  {s.schedule && (
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{s.schedule}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: editor or runner */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Runner overlay */}
            {runState ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={targetConnId}
                    onChange={e => {
                      const t = connectedTabs.find(tab => tab.connId === e.target.value)
                      setTargetConnId(e.target.value)
                      setTargetConnType(t?.sessionType ?? 'ssh')
                    }}
                    style={{ flex: 1 }}
                  >
                    <option value="">— Select target session —</option>
                    {connectedTabs.map(t => (
                      <option key={t.id} value={t.connId}>{t.title}</option>
                    ))}
                  </select>
                  {!runState.done && (
                    <button onClick={cancelScript} style={{
                      background: 'none', border: '1px solid var(--red)', color: 'var(--red)',
                      borderRadius: 4, padding: '4px 12px', fontSize: 11,
                    }}>Cancel</button>
                  )}
                  {runState.done && (
                    <span style={{ fontSize: 12, color: runState.success ? 'var(--green)' : 'var(--red)' }}>
                      {runState.success ? '✓ Done' : '✗ Failed'}
                    </span>
                  )}
                </div>

                {form.steps.map((step, i) => (
                  <div key={i} style={{
                    background: 'var(--bg3)', borderRadius: 4, padding: 10,
                    border: `1px solid ${runState.stepStatuses[i] === 'running' ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Step {i + 1}</span>
                      {stepStatusIcon(runState.stepStatuses[i])}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>→ {step.send}</div>
                    {step.expect && (
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>⌛ {step.expect}</div>
                    )}
                    {runState.stepOutputs[i] && (
                      <div style={{ marginTop: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--green)', background: '#0d200d', borderRadius: 3, padding: '4px 6px', maxHeight: 80, overflowY: 'auto' }}>
                        {runState.stepOutputs[i]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Name */}
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Script name"
                />

                {/* Schedule */}
                <div>
                  <input
                    value={form.schedule ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, schedule: e.target.value }))}
                    placeholder="Schedule (cron, optional): 0 */6 * * *"
                  />
                </div>

                {/* Steps */}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Steps</div>
                {form.steps.map((step, i) => (
                  <div key={i} style={{ background: 'var(--bg3)', borderRadius: 4, padding: 10, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', minWidth: 16 }}>{i + 1}</span>
                      <button onClick={() => removeStep(i)} style={{
                        marginLeft: 'auto', background: 'none', border: 'none',
                        color: 'var(--red)', fontSize: 13, padding: '0 2px',
                      }}>✕</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        value={step.send}
                        onChange={e => setStep(i, { send: e.target.value })}
                        placeholder="Send command (supports {variable})"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                      />
                      <input
                        value={step.expect ?? ''}
                        onChange={e => setStep(i, { expect: e.target.value || undefined })}
                        placeholder="Expect regex (optional): #|>"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                      />
                      <input
                        type="number"
                        value={step.timeoutMs ?? 10000}
                        onChange={e => setStep(i, { timeoutMs: parseInt(e.target.value, 10) || 10000 })}
                        placeholder="Timeout ms"
                        style={{ width: 120 }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!step.requireApproval}
                          onChange={e => setStep(i, { requireApproval: e.target.checked })}
                          style={{ width: 'auto', margin: 0 }}
                        />
                        Require approval before this step
                      </label>
                      {step.requireApproval && (
                        <input
                          value={step.approvalPrompt ?? ''}
                          onChange={e => setStep(i, { approvalPrompt: e.target.value || undefined })}
                          placeholder="Approval message (sent to webhook)"
                          style={{ fontSize: 11 }}
                        />
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={addStep} style={{
                  background: 'none', border: '1px dashed var(--border)', color: 'var(--text-dim)',
                  borderRadius: 4, padding: '6px 0', fontSize: 12,
                }}>+ Add Step</button>
              </div>
            )}

            {/* Footer */}
            <div style={{
              borderTop: '1px solid var(--border)', padding: '8px 16px',
              display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
            }}>
              {!runState && selected && (
                <button onClick={del} style={{
                  background: 'none', border: '1px solid var(--red)', color: 'var(--red)',
                  borderRadius: 4, padding: '4px 12px', fontSize: 11,
                }}>Delete</button>
              )}
              {runState?.done && (
                <button onClick={() => setRunState(null)} style={{
                  background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
                  borderRadius: 4, padding: '4px 12px', fontSize: 11,
                }}>← Back to Editor</button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                {!runState && (
                  <>
                    {selected && connectedTabs.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select
                          value={targetConnId}
                          onChange={e => {
                            const t = connectedTabs.find(tab => tab.connId === e.target.value)
                            setTargetConnId(e.target.value)
                            setTargetConnType(t?.sessionType ?? 'ssh')
                          }}
                          style={{ width: 140, fontSize: 11 }}
                        >
                          <option value="">— Target —</option>
                          {connectedTabs.map(t => (
                            <option key={t.id} value={t.connId}>{t.title}</option>
                          ))}
                        </select>
                        <button
                          onClick={runScript}
                          disabled={!targetConnId || !selected}
                          style={{
                            background: targetConnId ? 'var(--green-dim)' : 'none',
                            border: `1px solid ${targetConnId ? 'var(--green)' : 'var(--border)'}`,
                            color: targetConnId ? 'var(--green)' : 'var(--text-dim)',
                            borderRadius: 4, padding: '4px 12px', fontSize: 11,
                          }}
                        >▶ Run</button>
                      </div>
                    )}
                    <button onClick={save} style={{
                      background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                      color: 'var(--accent)', borderRadius: 4, padding: '4px 16px', fontWeight: 600,
                    }}>Save</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
