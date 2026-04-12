import React, { useState, useEffect, useRef } from 'react'
import type { AuditEntry } from '../types'

const TYPE_COLOR: Record<string, string> = {
  connect:    'var(--green)',
  disconnect: 'var(--text-dim)',
  command:    'var(--accent)',
  error:      'var(--red)',
}

const TYPE_LABEL: Record<string, string> = {
  connect:    'CONNECT',
  disconnect: 'DISCONNECT',
  command:    'CMD',
  error:      'ERROR',
}

export default function AuditLog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [filterSession, setFilterSession] = useState('')
  const [filterType, setFilterType] = useState('')
  const [loading, setLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadEntries = async () => {
    setLoading(true)
    try {
      const data = await window.api.audit.getRecent(500)
      setEntries(data)
    } catch {
      // audit log may not exist yet
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
    intervalRef.current = setInterval(loadEntries, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const uniqueSessions = Array.from(new Set(entries.map(e => e.session))).sort()

  const filtered = entries.filter(e => {
    if (filterSession && e.session !== filterSession) return false
    if (filterType && e.type !== filterType) return false
    return true
  })

  const exportJsonl = () => {
    const text = entries.map(e => JSON.stringify(e)).join('\n')
    const blob = new Blob([text], { type: 'application/jsonlines' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `netshell-audit-${new Date().toISOString().slice(0,10)}.jsonl`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, width: 700, height: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>
            Audit Log
            {loading && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>refreshing…</span>}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={exportJsonl} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
              borderRadius: 4, padding: '3px 10px', fontSize: 11,
            }}>Export JSONL</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 16 }}>✕</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <select
            value={filterSession}
            onChange={e => setFilterSession(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">All sessions</option>
            {uniqueSessions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">All event types</option>
            <option value="connect">Connect</option>
            <option value="disconnect">Disconnect</option>
            <option value="command">Command</option>
            <option value="error">Error</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: '34px', whiteSpace: 'nowrap' }}>
            {filtered.length} events
          </span>
        </div>

        {/* Log entries */}
        <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font-mono)' }}>
          {filtered.length === 0 && !loading && (
            <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              No audit log entries yet. Connect to a session to start recording.
            </div>
          )}
          {filtered.map((e, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '4px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0, minWidth: 150 }}>
                {formatTime(e.ts)}
              </span>
              <span style={{
                fontSize: 9, padding: '1px 5px', borderRadius: 2,
                color: TYPE_COLOR[e.type] ?? 'var(--text-dim)',
                background: 'var(--bg3)',
                flexShrink: 0, minWidth: 68, textAlign: 'center',
              }}>
                {TYPE_LABEL[e.type] ?? e.type.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text)', flexShrink: 0, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.session}
              </span>
              {e.data && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.data}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
