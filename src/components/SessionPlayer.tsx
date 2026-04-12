/**
 * SessionPlayer — recording playback overlay.
 * Replays JSONL session recordings using xterm.js in read-only mode.
 * Shows timeline scrubber, speed control, and Ed25519 verification badge.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import type { RecordingMeta, RecordingFrame } from '../types'
import 'xterm/css/xterm.css'

interface Props {
  recording: RecordingMeta
  onClose: () => void
}

type Speed = 1 | 2 | 4

export default function SessionPlayer({ recording, onClose }: Props) {
  const termRef       = useRef<HTMLDivElement>(null)
  const termInst      = useRef<Terminal | null>(null)
  const fitAddon      = useRef<FitAddon | null>(null)
  const [frames, setFrames]         = useState<RecordingFrame[]>([])
  const [loading, setLoading]       = useState(true)
  const [verified, setVerified]     = useState<boolean | null>(null)
  const [playing, setPlaying]       = useState(false)
  const [position, setPosition]     = useState(0)   // index into frames
  const [speed, setSpeed]           = useState<Speed>(1)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameIdx    = useRef(0)
  const isMounted   = useRef(true)

  // Load frames + verify signature on mount
  useEffect(() => {
    isMounted.current = true
    Promise.all([
      window.api.recording.play(recording.id),
      window.api.recording.verify(recording.id),
    ]).then(([f, v]) => {
      if (!isMounted.current) return
      setFrames(f)
      setVerified(v.verified)
      setLoading(false)
    })

    return () => {
      isMounted.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [recording.id])

  // Init terminal
  useEffect(() => {
    if (!termRef.current || loading) return

    const term = new Terminal({
      theme: { background: '#0d1117', foreground: '#c9d1d9' },
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      fontSize: 13,
      disableStdin: true,
      scrollback: 50000,
    })
    const fa = new FitAddon()
    term.loadAddon(fa)
    term.open(termRef.current)
    fa.fit()
    termInst.current = term
    fitAddon.current = fa

    return () => { term.dispose() }
  }, [loading])

  function playFrames(startIdx: number) {
    if (!isMounted.current || startIdx >= frames.length) {
      if (isMounted.current) setPlaying(false)
      return
    }

    frameIdx.current = startIdx
    setPosition(startIdx)

    const frame = frames[startIdx]
    if (frame.type === 'output' && termInst.current) {
      termInst.current.write(frame.data)
    } else if (frame.type === 'resize' && termInst.current) {
      termInst.current.resize(frame.cols ?? 80, frame.rows ?? 24)
    }

    if (startIdx + 1 >= frames.length) {
      setPlaying(false)
      return
    }

    const next = frames[startIdx + 1]
    const delay = (next.t - frame.t) / speed
    timerRef.current = setTimeout(() => playFrames(startIdx + 1), Math.max(0, delay))
  }

  function handlePlay() {
    if (playing) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPlaying(false)
      return
    }
    const startFrom = frameIdx.current >= frames.length - 1 ? 0 : frameIdx.current
    if (startFrom === 0 && termInst.current) termInst.current.reset()
    setPlaying(true)
    playFrames(startFrom)
  }

  function handleScrub(idx: number) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPlaying(false)
    // Replay from start to idx
    if (termInst.current) {
      termInst.current.reset()
      for (let i = 0; i <= idx; i++) {
        const f = frames[i]
        if (f.type === 'output') termInst.current.write(f.data)
        else if (f.type === 'resize') termInst.current.resize(f.cols, f.rows)
      }
    }
    frameIdx.current = idx
    setPosition(idx)
  }

  const duration = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0
  const currentTs = frames[position]?.t ?? 0
  const elapsed = frames.length > 0 ? currentTs - frames[0].t : 0

  function formatMs(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '90vw', maxWidth: 1100, height: '80vh', background: '#0d1117', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{recording.sessionName}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{new Date(recording.startTs).toLocaleString()}</span>
          <span style={{ flex: 1 }} />
          {/* Verification badge */}
          {verified === true  && <span style={{ color: '#3fb950', fontSize: 12, fontWeight: 600 }}>✓ Verified</span>}
          {verified === false && <span style={{ color: '#f97583', fontSize: 12, fontWeight: 600 }}>⚠ Unverified</span>}
          {verified === null  && <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>Verifying…</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Terminal */}
        <div ref={termRef} style={{ flex: 1, overflow: 'hidden' }} />

        {/* Controls */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={handlePlay} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: 13, minWidth: 60 }}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>

          <input
            type="range" min={0} max={frames.length - 1} value={position}
            onChange={e => handleScrub(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />

          <span style={{ fontSize: 12, color: 'var(--fg-dim)', minWidth: 80, textAlign: 'right' }}>
            {formatMs(elapsed)} / {formatMs(duration)}
          </span>

          <select
            value={speed}
            onChange={e => setSpeed(parseInt(e.target.value) as Speed)}
            style={{ background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
          >
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </div>
      </div>
    </div>
  )
}
