import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import type { Session, CredentialMeta, OpenTab } from '../types'

interface Props {
  tab: OpenTab
  session: Session
  credentials: CredentialMeta[]
  isActive: boolean
  onUpdateTab: (patch: Partial<OpenTab>) => void
  onClose: () => void
}

const XTERM_THEME = {
  background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff',
  selectionBackground: '#264f78',
  black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
  blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
  brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
}

export default function TerminalTab({ tab, session, isActive, onUpdateTab, onClose: _onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef      = useRef<Terminal | null>(null)
  const fitRef       = useRef<FitAddon | null>(null)
  const connIdRef    = useRef<string | null>(null)
  const mountedRef   = useRef(false)

  useEffect(() => {
    if (!session || mountedRef.current) return
    mountedRef.current = true

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      scrollback: 10000,
      cursorBlink: true,
      convertEol: true,
    })
    const fit    = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    termRef.current = term
    fitRef.current  = fit

    if (containerRef.current) {
      term.open(containerRef.current)
      fit.fit()
    }

    switch (session.type) {
      case 'ssh':    connectSsh(term, fit); break
      case 'telnet': connectTelnet(term, fit); break
      case 'serial': connectSerial(term, fit); break
      case 'meraki': startMerakiRepl(term, fit); break
    }

    const ro = new ResizeObserver(() => {
      fitRef.current?.fit()
      if (connIdRef.current && (session.type === 'ssh')) {
        window.api.ssh.resize(connIdRef.current, term.rows, term.cols)
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      disconnectAll()
      term.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus()
      fitRef.current?.fit()
    }
  }, [isActive])

  // ── Disconnect helpers ───────────────────────────────────────────
  function disconnectAll() {
    if (!connIdRef.current) return
    const id = connIdRef.current
    try {
      if (session.type === 'ssh')    window.api.ssh.disconnect(id)
      if (session.type === 'serial') window.api.serial.disconnect(id)
      if (session.type === 'telnet') window.api.telnet.disconnect(id)
    } catch {}
    connIdRef.current = null
  }

  // ── Shared setup for raw stream transports ───────────────────────
  function wireStream(
    term: Terminal,
    transport: { write: (id: string, d: string) => Promise<void>; disconnect: (id: string) => Promise<void> },
    onData: (cb: (connId: string, d: string) => void) => () => void,
    onClosed: (cb: (connId: string) => void) => () => void,
    onError: (cb: (connId: string, m: string) => void) => () => void,
    connId: string,
  ) {
    connIdRef.current = connId

    const rmData   = onData((id, d)   => { if (id === connId) term.write(d) })
    const rmClosed = onClosed((id)    => { if (id === connId) { term.write('\r\n\x1b[33m--- Connection closed ---\x1b[0m\r\n'); onUpdateTab({ status: 'disconnected' }) } })
    const rmError  = onError((id, m)  => { if (id === connId) { term.write(`\r\n\x1b[31mError: ${m}\x1b[0m\r\n`); onUpdateTab({ status: 'error' }) } })

    term.onData(d => transport.write(connId, d))

    // Patch dispose to clean up listeners
    const origDispose = term.dispose.bind(term)
    term.dispose = () => { rmData(); rmClosed(); rmError(); origDispose() }
  }

  // ── SSH ──────────────────────────────────────────────────────────
  async function connectSsh(term: Terminal, fit: FitAddon) {
    if (!session.host || !session.credentialId) {
      term.write('\r\n\x1b[31mMissing host or credential.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' }); return
    }
    term.write(`\x1b[36mConnecting to ${session.host}:${session.port ?? 22}...\x1b[0m\r\n`)
    try {
      const { connId } = await window.api.ssh.connect({
        sessionId: session.id,
        host: session.host, port: session.port ?? 22,
        credentialId: session.credentialId,
        authType: session.authType ?? 'password',
        privateKeyPath: session.privateKeyPath,
        rows: term.rows, cols: term.cols,
      })
      wireStream(term, window.api.ssh, window.api.ssh.onData, window.api.ssh.onClosed, window.api.ssh.onError, connId)
      term.onResize(({ rows, cols }) => window.api.ssh.resize(connId, rows, cols))
      onUpdateTab({ connId, status: 'connected' })
    } catch (err: unknown) {
      term.write(`\r\n\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      onUpdateTab({ status: 'error' })
    }
  }

  // ── Telnet ───────────────────────────────────────────────────────
  async function connectTelnet(term: Terminal, _fit: FitAddon) {
    if (!session.host) {
      term.write('\r\n\x1b[31mMissing host.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' }); return
    }
    term.write(`\x1b[36mConnecting to ${session.host}:${session.port ?? 23}...\x1b[0m\r\n`)
    try {
      const { connId } = await window.api.telnet.connect({
        sessionId: session.id, host: session.host, port: session.port ?? 23,
      })
      wireStream(term, window.api.telnet, window.api.telnet.onData, window.api.telnet.onClosed, window.api.telnet.onError, connId)
      onUpdateTab({ connId, status: 'connected' })
    } catch (err: unknown) {
      term.write(`\r\n\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      onUpdateTab({ status: 'error' })
    }
  }

  // ── Serial ───────────────────────────────────────────────────────
  async function connectSerial(term: Terminal, _fit: FitAddon) {
    if (!session.serialPort) {
      term.write('\r\n\x1b[31mNo serial port configured.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' }); return
    }
    term.write(`\x1b[36mOpening ${session.serialPort} @ ${session.baudRate ?? 9600} baud...\x1b[0m\r\n`)
    try {
      const { connId } = await window.api.serial.connect({
        sessionId: session.id,
        path: session.serialPort,
        baudRate: session.baudRate ?? 9600,
        dataBits: session.dataBits ?? 8,
        stopBits: session.stopBits ?? 1,
        parity: session.parity ?? 'none',
      })
      wireStream(term, window.api.serial, window.api.serial.onData, window.api.serial.onClosed, window.api.serial.onError, connId)
      onUpdateTab({ connId, status: 'connected' })
    } catch (err: unknown) {
      term.write(`\r\n\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      onUpdateTab({ status: 'error' })
    }
  }

  // ── Meraki REPL ──────────────────────────────────────────────────
  async function startMerakiRepl(term: Terminal, _fit: FitAddon) {
    if (!session.credentialId) {
      term.write('\r\n\x1b[31mNo credential configured for this Meraki session.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' }); return
    }

    // Check meraki-cli is installed
    const installed = await window.api.meraki.check()
    if (!installed) {
      term.write([
        '\r\n\x1b[33mmeraki-cli not found.\x1b[0m',
        '\r\nInstall it with:  \x1b[36mpip install meraki-cli\x1b[0m',
        '\r\nThen reopen this session.\r\n',
      ].join(''))
      onUpdateTab({ status: 'error' }); return
    }

    onUpdateTab({ status: 'connected' })
    term.write('\x1b[32mmeraki-cli ready.\x1b[0m  Type \x1b[36m?\x1b[0m or \x1b[36mhelp\x1b[0m for commands.\r\n\r\n')

    // Register global meraki data/done/error listeners (persist for session lifetime)
    const rmData  = window.api.meraki.onData( (id, d) => { if (id === execIdRef.current) term.write(d) })
    const rmDone  = window.api.meraki.onDone( (id)    => { if (id === execIdRef.current) { execIdRef.current = null; showPrompt(term) } })
    const rmError = window.api.meraki.onError((id, m) => { if (id === execIdRef.current) { term.write(`\r\n\x1b[31m${m}\x1b[0m\r\n`); execIdRef.current = null; showPrompt(term) } })

    const origDispose = term.dispose.bind(term)
    term.dispose = () => { rmData(); rmDone(); rmError(); origDispose() }

    // Input handling for the REPL
    let inputBuf = ''
    showPrompt(term)

    term.onData(data => {
      if (execIdRef.current) {
        // Ctrl+C during execution — can't easily cancel meraki-cli, just show message
        if (data === '\x03') term.write('^C\r\n')
        return
      }

      for (const ch of data) {
        const code = ch.charCodeAt(0)
        if (ch === '\r' || ch === '\n') {
          term.write('\r\n')
          const cmd = inputBuf.trim()
          inputBuf = ''
          if (cmd) runMerakiCommand(term, cmd, session.credentialId!)
          else showPrompt(term)
        } else if (code === 127 || ch === '\x08') {
          // Backspace
          if (inputBuf.length > 0) {
            inputBuf = inputBuf.slice(0, -1)
            term.write('\x1b[D \x1b[D')
          }
        } else if (code === 3) {
          // Ctrl+C — clear line
          inputBuf = ''
          term.write('^C\r\n')
          showPrompt(term)
        } else if (code >= 32) {
          inputBuf += ch
          term.write(ch)
        }
      }
    })
  }

  const execIdRef = useRef<string | null>(null)

  function showPrompt(term: Terminal) {
    term.write('\x1b[36mmeraki\x1b[0m\x1b[2m>\x1b[0m ')
  }

  async function runMerakiCommand(term: Terminal, command: string, credentialId: string) {
    const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2)}`
    execIdRef.current = id
    // Clear any prior output that came before table rendering
    await window.api.meraki.exec({ execId: id, credentialId, command })
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0d1117' }}
    />
  )
}
