/**
 * TelemetryTab — gNMI session display.
 * Replaces the terminal for sessions of type 'gnmi'.
 * Shows live counter cards and mini sparklines per subscribed path.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { Session, TelemetryPoint } from '../types'

interface Props {
  session: Session
  tabId: string
}

interface PathSeries {
  path: string
  latest: string | number | boolean
  unit?: string
  history: { ts: number; value: number }[]  // last 60 numeric points
}

const MAX_HISTORY = 60

export default function TelemetryTab({ session }: Props) {
  const [connId, setConnId]     = useState<string | null>(null)
  const [status, setStatus]     = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError]       = useState<string | null>(null)
  const [series, setSeries]     = useState<Map<string, PathSeries>>(new Map())
  const unsubRef                = useRef<(() => void)[]>([])

  function connect() {
    if (status === 'connecting' || status === 'connected') return
    setStatus('connecting')
    setError(null)

    window.api.gnmi.connect({
      sessionId: session.id,
      host: session.host!,
      port: session.gnmiPort ?? 9339,
      credentialId: session.credentialId,
      insecure: session.gnmiInsecure,
      paths: session.gnmiPaths ?? ['/interfaces/interface/state/counters'],
      sampleIntervalMs: 10000,
    }).then(({ connId: cid }) => {
      setConnId(cid)
      setStatus('connected')
    }).catch(e => {
      setStatus('error')
      setError(e.message)
    })
  }

  function disconnect() {
    if (connId) {
      window.api.gnmi.disconnect(connId)
      setConnId(null)
    }
    setStatus('idle')
  }

  useEffect(() => {
    const offData = window.api.gnmi.onData((cid, point: TelemetryPoint) => {
      if (cid !== connId) return
      setSeries(prev => {
        const next = new Map(prev)
        const existing = next.get(point.path) ?? { path: point.path, latest: point.value, history: [] }
        const numVal = typeof point.value === 'number' ? point.value
          : typeof point.value === 'string' ? parseFloat(point.value) : NaN
        const history = [...existing.history]
        if (!isNaN(numVal)) {
          history.push({ ts: point.ts, value: numVal })
          if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
        }
        next.set(point.path, { ...existing, latest: point.value, history })
        return next
      })
    })
    const offClosed = window.api.gnmi.onClosed((cid) => {
      if (cid === connId) { setConnId(null); setStatus('idle') }
    })
    const offError = window.api.gnmi.onError((cid, msg) => {
      if (cid === connId) { setStatus('error'); setError(msg) }
    })
    unsubRef.current = [offData, offClosed, offError]
    return () => { unsubRef.current.forEach(f => f()) }
  }, [connId])

  const seriesArr = Array.from(series.values())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>gNMI Telemetry</span>
        <span style={{ flex: 1 }} />
        <span style={{
          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: status === 'connected' ? '#22863a33' : status === 'error' ? '#8b000033' : '#33333388',
          color: status === 'connected' ? '#3fb950' : status === 'error' ? '#f97583' : 'var(--fg-dim)',
        }}>
          {status.toUpperCase()}
        </span>
        {status !== 'connected'
          ? <button onClick={connect} style={btnStyle('#1f6feb')}>Connect</button>
          : <button onClick={disconnect} style={btnStyle('#8b0000')}>Disconnect</button>
        }
      </div>

      {error && (
        <div style={{ padding: '6px 12px', background: '#5a0000', color: '#f97583', fontSize: 12 }}>{error}</div>
      )}

      {/* Cards grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
        {seriesArr.length === 0 && status === 'connected' && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, padding: 8 }}>Waiting for telemetry data…</div>
        )}
        {seriesArr.length === 0 && status === 'idle' && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, padding: 8 }}>
            Paths: {(session.gnmiPaths ?? []).join(', ') || 'none configured'}
          </div>
        )}
        {seriesArr.map(s => (
          <TelemetryCard key={s.path} series={s} />
        ))}
      </div>
    </div>
  )
}

function TelemetryCard({ series }: { series: PathSeries }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shortPath = series.path.split('/').slice(-2).join('/')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || series.history.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width, h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const vals = series.history.map(p => p.value)
    const min = Math.min(...vals), max = Math.max(...vals)
    const range = max - min || 1

    ctx.strokeStyle = '#1f6feb'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 4) - 2
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [series.history])

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, minWidth: 200, maxWidth: 320 }}>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 4, wordBreak: 'break-all' }} title={series.path}>{shortPath}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        {typeof series.latest === 'number' ? series.latest.toLocaleString() : String(series.latest)}
        {series.unit && <span style={{ fontSize: 12, color: 'var(--fg-dim)', marginLeft: 4 }}>{series.unit}</span>}
      </div>
      {series.history.length >= 2 && (
        <canvas ref={canvasRef} width={240} height={40} style={{ display: 'block', width: '100%', height: 40 }} />
      )}
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return { background: bg, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }
}
