import React, { useState } from 'react'
import { diffLines } from 'diff'

interface DiffLine {
  value: string
  added?: boolean
  removed?: boolean
}

export default function DiffViewer({ onClose }: { onClose: () => void }) {
  const [configA, setConfigA] = useState('')
  const [configB, setConfigB] = useState('')
  const [diff, setDiff] = useState<DiffLine[]>([])
  const [compared, setCompared] = useState(false)

  const compare = () => {
    const result = diffLines(configA, configB)
    setDiff(result)
    setCompared(true)
  }

  const copyDiff = () => {
    const text = diff.map(d => {
      const prefix = d.added ? '+' : d.removed ? '-' : ' '
      return d.value.split('\n').filter(Boolean).map(l => prefix + l).join('\n')
    }).join('\n')
    navigator.clipboard.writeText(text)
  }

  const exportHtml = () => {
    const rows = diff.map(d => {
      const color = d.added ? '#1a3a1a' : d.removed ? '#3a1a1a' : 'transparent'
      const textColor = d.added ? '#3fb950' : d.removed ? '#f85149' : '#c9d1d9'
      const prefix = d.added ? '+' : d.removed ? '-' : ' '
      return d.value.split('\n').filter(Boolean).map(l =>
        `<div style="background:${color};color:${textColor};font-family:monospace;padding:1px 8px;white-space:pre">${prefix}${l}</div>`
      ).join('')
    }).join('')

    const html = `<!DOCTYPE html><html><head><title>Config Diff</title></head><body style="background:#0d1117;margin:0;padding:16px">${rows}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'config-diff.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  const addedLines = diff.filter(d => d.added).reduce((n, d) => n + d.value.split('\n').filter(Boolean).length, 0)
  const removedLines = diff.filter(d => d.removed).reduce((n, d) => n + d.value.split('\n').filter(Boolean).length, 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, width: 800, height: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>Config Diff</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12 }}>
          {/* Input row */}
          <div style={{ display: 'flex', gap: 12, height: 160, flexShrink: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Config A (before)</label>
              <textarea
                value={configA}
                onChange={e => setConfigA(e.target.value)}
                placeholder="Paste config A here…"
                style={{ flex: 1, resize: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>Config B (after)</label>
              <textarea
                value={configB}
                onChange={e => setConfigB(e.target.value)}
                placeholder="Paste config B here…"
                style={{ flex: 1, resize: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={compare} style={{
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              color: 'var(--accent)', borderRadius: 4, padding: '6px 20px', fontWeight: 600,
            }}>Compare</button>
            {compared && (
              <>
                <span style={{ fontSize: 11, color: 'var(--green)' }}>+{addedLines}</span>
                <span style={{ fontSize: 11, color: 'var(--red)' }}>-{removedLines}</span>
                <button onClick={copyDiff} style={{
                  background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
                  borderRadius: 4, padding: '4px 12px', fontSize: 11, marginLeft: 'auto',
                }}>Copy Diff</button>
                <button onClick={exportHtml} style={{
                  background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
                  borderRadius: 4, padding: '4px 12px', fontSize: 11,
                }}>Export HTML</button>
              </>
            )}
          </div>

          {/* Diff output */}
          {compared && (
            <div style={{
              flex: 1, overflowY: 'auto', border: '1px solid var(--border)',
              borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11,
            }}>
              {diff.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--green)', textAlign: 'center' }}>No differences found — configs are identical.</div>
              ) : diff.map((d, i) => {
                const bg = d.added ? 'var(--green-dim)' : d.removed ? '#200' : 'transparent'
                const color = d.added ? 'var(--green)' : d.removed ? 'var(--red)' : 'var(--text-dim)'
                const prefix = d.added ? '+' : d.removed ? '-' : ' '
                return d.value.split('\n').filter(l => l !== '').map((line, j) => (
                  <div key={`${i}-${j}`} style={{ padding: '1px 8px', background: bg, color, whiteSpace: 'pre' }}>
                    {prefix}{line}
                  </div>
                ))
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
