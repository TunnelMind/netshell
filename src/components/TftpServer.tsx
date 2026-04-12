import React, { useState, useEffect } from 'react'
import type { TftpTransferEntry } from '../types'

export default function TftpServer({ onClose }: { onClose: () => void }) {
  const [bindAddr, setBindAddr] = useState('0.0.0.0')
  const [rootDir, setRootDir] = useState('')
  const [running, setRunning] = useState(false)
  const [transfers, setTransfers] = useState<TftpTransferEntry[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const unStatus = window.api.tftp.onStatus(r => setRunning(r))
    const unTransfer = window.api.tftp.onTransfer(entry => {
      setTransfers(prev => [entry, ...prev].slice(0, 200))
    })
    return () => { unStatus(); unTransfer() }
  }, [])

  const start = async () => {
    setError('')
    if (!rootDir.trim()) {
      setError('Root directory is required')
      return
    }
    try {
      await window.api.tftp.start({ bindAddr, rootDir })
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  const stop = async () => {
    await window.api.tftp.stop()
  }

  const formatBytes = (n: number) => {
    if (n === 0) return '—'
    if (n < 1024) return `${n}B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
    return `${(n / (1024 * 1024)).toFixed(1)}MB`
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, width: 560, maxHeight: '75vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>TFTP Server</span>
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 10,
              background: running ? 'var(--green-dim)' : 'var(--bg3)',
              color: running ? 'var(--green)' : 'var(--text-dim)',
              border: `1px solid ${running ? 'var(--green)' : 'var(--border)'}`,
            }}>
              {running ? '● RUNNING' : '○ STOPPED'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Config */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 140 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Bind Address</label>
              <input
                value={bindAddr}
                onChange={e => setBindAddr(e.target.value)}
                disabled={running}
                placeholder="0.0.0.0"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Root Directory</label>
              <input
                value={rootDir}
                onChange={e => setRootDir(e.target.value)}
                disabled={running}
                placeholder="/srv/tftp or C:\tftp"
              />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--red)', background: '#300', borderRadius: 4, padding: '6px 10px' }}>{error}</div>
          )}

          {/* Toggle button */}
          <button
            onClick={running ? stop : start}
            style={{
              padding: '10px 0', borderRadius: 4, fontWeight: 700, fontSize: 13,
              background: running ? '#300' : 'var(--green-dim)',
              border: `1px solid ${running ? 'var(--red)' : 'var(--green)'}`,
              color: running ? 'var(--red)' : 'var(--green)',
            }}
          >
            {running ? 'Stop TFTP Server' : 'Start TFTP Server'}
          </button>

          {/* Transfer log */}
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between' }}>
            <span>Transfer Log</span>
            {transfers.length > 0 && (
              <button onClick={() => setTransfers([])} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 10, padding: 0 }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflowY: 'auto', maxHeight: 200 }}>
            {transfers.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>
                No transfers yet. Start the server and transfer a file from a device.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                    <th style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Time</th>
                    <th style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>File</th>
                    <th style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Client</th>
                    <th style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Size</th>
                    <th style={{ padding: '4px 10px', textAlign: 'left', color: 'var(--text-dim)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '3px 10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{formatTime(t.ts)}</td>
                      <td style={{ padding: '3px 10px', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{t.file}</td>
                      <td style={{ padding: '3px 10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{t.client}</td>
                      <td style={{ padding: '3px 10px', color: 'var(--text-dim)' }}>{formatBytes(t.size)}</td>
                      <td style={{ padding: '3px 10px', color: t.status === 'done' ? 'var(--green)' : 'var(--red)' }}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
