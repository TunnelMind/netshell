import React, { useState } from 'react'
import type { Session } from '../types'

interface Props {
  onImport: (sessions: Partial<Session>[]) => void
  onClose: () => void
}

type Tab = 'putty' | 'ssh'

export default function ImportWizard({ onImport, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('ssh')
  const [loading, setLoading] = useState(false)
  const [sshConfigPath, setSshConfigPath] = useState('~/.ssh/config')
  const [preview, setPreview] = useState<Partial<Session>[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const loadPuTTY = async () => {
    setLoading(true)
    setError('')
    try {
      const sessions = await window.api.import.putty()
      setPreview(sessions)
      setSelected(new Set(sessions.map(s => s.id!).filter(Boolean)))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loadSSHConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const sessions = await window.api.import.sshConfig(sshConfigPath.startsWith('~') ? undefined : sshConfigPath)
      setPreview(sessions)
      setSelected(new Set(sessions.map(s => s.id!).filter(Boolean)))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const toggleAll = () => {
    if (selected.size === preview.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(preview.map(s => s.id!).filter(Boolean)))
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleImport = () => {
    const toImport = preview.filter(s => s.id && selected.has(s.id))
    onImport(toImport)
  }

  const tabStyle = (t: Tab) => ({
    padding: '6px 16px',
    fontSize: 12,
    background: tab === t ? 'var(--accent-dim)' : 'none',
    border: '1px solid',
    borderColor: tab === t ? 'var(--accent)' : 'var(--border)',
    color: tab === t ? 'var(--accent)' : 'var(--text-dim)',
    borderRadius: 4,
    cursor: 'pointer',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 24, width: 600, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: 16,
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>Import Sessions</div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tabStyle('ssh')} onClick={() => { setTab('ssh'); setPreview([]); setError('') }}>
            SSH Config (~/.ssh/config)
          </button>
          <button style={tabStyle('putty')} onClick={() => { setTab('putty'); setPreview([]); setError('') }}>
            PuTTY (Windows)
          </button>
        </div>

        {/* Tab content */}
        {tab === 'ssh' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={sshConfigPath}
              onChange={e => setSshConfigPath(e.target.value)}
              placeholder="~/.ssh/config"
              style={{ flex: 1 }}
            />
            <button
              onClick={loadSSHConfig}
              disabled={loading}
              style={{
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 4, padding: '6px 16px', flexShrink: 0,
              }}
            >
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        )}

        {tab === 'putty' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>
              Reads HKCU\Software\SimonTatham\PuTTY\Sessions (Windows only)
            </div>
            <button
              onClick={loadPuTTY}
              disabled={loading}
              style={{
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 4, padding: '6px 16px', flexShrink: 0,
              }}
            >
              {loading ? 'Scanning…' : 'Scan Registry'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', padding: '6px 10px', background: '#300', borderRadius: 4 }}>
            {error}
          </div>
        )}

        {/* Preview table */}
        {preview.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', width: 32 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === preview.length}
                      onChange={toggleAll}
                      style={{ width: 'auto' }}
                    />
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Name</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Host</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', width: 60 }}>Port</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', width: 70 }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => toggleOne(s.id!)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selected.has(s.id!) ? 'var(--accent-dim)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '5px 10px' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id!)}
                        onChange={() => toggleOne(s.id!)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 'auto' }}
                      />
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--text)' }}>{s.name}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{s.host}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text-dim)' }}>{s.port}</td>
                    <td style={{ padding: '5px 10px', color: 'var(--text-dim)' }}>{s.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview.length === 0 && !loading && !error && (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, padding: 24 }}>
            {tab === 'ssh' ? 'Click Load to parse your SSH config file.' : 'Click Scan Registry to find PuTTY sessions.'}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {preview.length > 0 && `${selected.size} of ${preview.length} selected`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
              borderRadius: 4, padding: '6px 16px',
            }}>Cancel</button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              style={{
                background: selected.size > 0 ? 'var(--accent-dim)' : 'none',
                border: '1px solid',
                borderColor: selected.size > 0 ? 'var(--accent)' : 'var(--border)',
                color: selected.size > 0 ? 'var(--accent)' : 'var(--text-dim)',
                borderRadius: 4, padding: '6px 16px', fontWeight: 600,
              }}
            >
              Import {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
