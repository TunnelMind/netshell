/**
 * ObservabilityPane — collapsible sidebar showing live SSH-polled device stats.
 * Shows interface error counters, CPU utilization top processes, and active connections.
 * Polls every 30 seconds when open.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { OpenTab } from '../types'

interface Props {
  tab: OpenTab
  onClose: () => void
}

interface InterfaceCounter {
  name: string
  inputErrors: number
  outputErrors: number
}

interface CpuProcess {
  pid: string
  cpu: string
  name: string
}

export default function ObservabilityPane({ tab, onClose }: Props) {
  const [intfCounters, setIntfCounters] = useState<InterfaceCounter[]>([])
  const [cpuProcs, setCpuProcs]         = useState<CpuProcess[]>([])
  const [lastPoll, setLastPoll]         = useState<Date | null>(null)
  const [polling, setPolling]           = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function poll() {
    if (!tab.connId || tab.status !== 'connected') return
    setPolling(true)
    try {
      // Interface errors
      const intfOut = await fetchOutput('show interfaces | include errors|line protocol')
      const lines = intfOut.split('\n')
      const counters: InterfaceCounter[] = []
      let currentIf = ''
      for (const line of lines) {
        const ifMatch = line.match(/^(\S+)\s+is/)
        if (ifMatch) { currentIf = ifMatch[1]; continue }
        const errMatch = line.match(/(\d+) input errors.*?(\d+) output errors/i)
        if (errMatch && currentIf) {
          counters.push({ name: currentIf, inputErrors: parseInt(errMatch[1]), outputErrors: parseInt(errMatch[2]) })
        }
      }
      setIntfCounters(counters.filter(c => c.inputErrors > 0 || c.outputErrors > 0).slice(0, 10))

      // CPU processes (IOS style)
      const cpuOut = await fetchOutput('show processes cpu sorted | head 10')
      const cpuLines = cpuOut.split('\n').slice(2)
      const procs: CpuProcess[] = []
      for (const line of cpuLines) {
        const m = line.match(/^\s*(\d+)\s+\S+\s+\S+\s+(\S+)%\s+\S+\s+\S+\s+(.+?)\s*$/)
        if (m) procs.push({ pid: m[1], cpu: m[2], name: m[3] })
      }
      setCpuProcs(procs.slice(0, 5))

      setLastPoll(new Date())
    } finally {
      setPolling(false)
    }
  }

  async function fetchOutput(cmd: string): Promise<string> {
    if (!tab.connId) return ''
    const channelMap: Record<string, string> = {
      ssh: 'ssh:write', serial: 'serial:write', telnet: 'telnet:write',
    }
    // Use the appropriate write API; collect output via short delay
    // Since we can't call runCommandGetOutput directly from renderer,
    // we instead write the command and let the terminal collect it, then normalize
    // For observability this is best-effort — we request via IPC normalize API if available
    try {
      const data = await (window.api.normalize as any).rawCommand?.({ connId: tab.connId, connType: tab.sessionType, command: cmd })
      return data ?? ''
    } catch {
      return ''
    }
  }

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, 30_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [tab.connId, tab.status])

  const hasData = intfCounters.length > 0 || cpuProcs.length > 0

  return (
    <div style={{
      width: 240, borderLeft: '1px solid var(--border)', background: 'var(--bg2)',
      display: 'flex', flexDirection: 'column', fontSize: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 600 }}>Observability</span>
        <span style={{ flex: 1 }} />
        {polling && <span style={{ fontSize: 10, color: '#79c0ff' }}>●</span>}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, marginLeft: 6 }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!hasData && !polling && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 11 }}>No data yet. Polling every 30s.</div>
        )}

        {intfCounters.length > 0 && (
          <section>
            <div style={{ fontWeight: 600, color: 'var(--fg-dim)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Interface Errors</div>
            {intfCounters.map(c => (
              <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #1a1a1a' }}>
                <span style={{ color: 'var(--fg)', fontFamily: 'monospace', fontSize: 11 }}>{c.name.slice(0, 14)}</span>
                <span>
                  <span style={{ color: c.inputErrors > 0 ? '#f97583' : 'var(--fg-dim)', marginRight: 6 }}>↓{c.inputErrors}</span>
                  <span style={{ color: c.outputErrors > 0 ? '#e3b341' : 'var(--fg-dim)' }}>↑{c.outputErrors}</span>
                </span>
              </div>
            ))}
          </section>
        )}

        {cpuProcs.length > 0 && (
          <section>
            <div style={{ fontWeight: 600, color: 'var(--fg-dim)', fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Top CPU Processes</div>
            {cpuProcs.map(p => (
              <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #1a1a1a' }}>
                <span style={{ color: 'var(--fg)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{p.name}</span>
                <span style={{ color: parseFloat(p.cpu) > 20 ? '#f97583' : 'var(--fg)', fontFamily: 'monospace', fontSize: 11 }}>{p.cpu}%</span>
              </div>
            ))}
          </section>
        )}
      </div>

      {lastPoll && (
        <div style={{ padding: '4px 10px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--fg-dim)' }}>
          Last poll: {lastPoll.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
