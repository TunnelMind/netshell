import React, { useEffect, useRef, useCallback } from 'react'
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

export default function TerminalTab({ tab, session, credentials, isActive, onUpdateTab, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const connIdRef = useRef<string | null>(null)
  const connectedRef = useRef(false)

  // Connect on mount
  useEffect(() => {
    if (!session || connectedRef.current) return
    connectedRef.current = true

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#264f78',
        black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
        blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
        brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
        brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      scrollback: 10000,
      cursorBlink: true,
      allowTransparency: false,
      convertEol: true,
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)

    termRef.current = term
    fitRef.current = fit

    if (containerRef.current) {
      term.open(containerRef.current)
      fit.fit()
    }

    if (session.type === 'ssh') {
      connectSsh(term, fit)
    } else {
      term.write('\r\n\x1b[33mSession type not yet implemented in this build.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' })
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (fitRef.current && termRef.current) {
        fitRef.current.fit()
        if (connIdRef.current) {
          window.api.ssh.resize(connIdRef.current, termRef.current.rows, termRef.current.cols)
        }
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (connIdRef.current) window.api.ssh.disconnect(connIdRef.current).catch(() => {})
      term.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus terminal when tab becomes active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus()
      fitRef.current?.fit()
    }
  }, [isActive])

  const connectSsh = async (term: Terminal, fit: FitAddon) => {
    if (!session.host || !session.credentialId) {
      term.write('\r\n\x1b[31mSession is missing host or credentials.\x1b[0m\r\n')
      onUpdateTab({ status: 'error' })
      return
    }

    term.write(`\x1b[36mConnecting to ${session.host}:${session.port ?? 22}...\x1b[0m\r\n`)

    // Register data listener BEFORE connecting
    const removeData = window.api.ssh.onData((connId, data) => {
      if (connId === connIdRef.current) {
        term.write(data)
      }
    })
    const removeClosed = window.api.ssh.onClosed((connId) => {
      if (connId === connIdRef.current) {
        term.write('\r\n\x1b[33m--- Connection closed ---\x1b[0m\r\n')
        onUpdateTab({ status: 'disconnected' })
      }
    })
    const removeError = window.api.ssh.onError((connId, msg) => {
      if (connId === connIdRef.current) {
        term.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`)
        onUpdateTab({ status: 'error' })
      }
    })

    // Cleanup listeners when terminal unmounts
    const origDispose = term.dispose.bind(term)
    term.dispose = () => {
      removeData()
      removeClosed()
      removeError()
      origDispose()
    }

    try {
      const { connId } = await window.api.ssh.connect({
        sessionId: session.id,
        host: session.host,
        port: session.port ?? 22,
        credentialId: session.credentialId,
        authType: session.authType ?? 'password',
        privateKeyPath: session.privateKeyPath,
        rows: term.rows,
        cols: term.cols,
      })

      connIdRef.current = connId
      onUpdateTab({ connId, status: 'connected' })

      // Forward keypresses to SSH stream
      term.onData(data => {
        window.api.ssh.write(connId, data)
      })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      term.write(`\r\n\x1b[31mFailed to connect: ${msg}\x1b[0m\r\n`)
      onUpdateTab({ status: 'error' })
    }
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0d1117' }}
    />
  )
}
