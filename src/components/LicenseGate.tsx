/**
 * LicenseGate — wraps the entire app.
 * - No license / invalid → shows activation screen.
 * - In grace period (expired but within grace window) → shows warning banner, app still runs.
 * - Fully expired → shows hard block screen, app unusable.
 * - Valid → renders children normally.
 */
import React, { useEffect, useState, useCallback } from 'react'
import type { LicenseState } from '../types'

interface Props {
  children: React.ReactNode
}

export default function LicenseGate({ children }: Props) {
  const [state, setState]   = useState<LicenseState | null>(null)
  const [key, setKey]       = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [dismissed, setDismissed] = useState(false)  // grace-period banner dismissed

  const refresh = useCallback(async () => {
    const s = await window.api.license.status()
    setState(s)
  }, [])

  useEffect(() => {
    refresh()
    // Listen for runtime expiry event pushed from main process
    const unsub = window.api.license.onExpired(() => refresh())
    return unsub
  }, [refresh])

  async function handleActivate() {
    if (!key.trim()) return
    setBusy(true)
    setError('')
    try {
      const s = await window.api.license.activate(key)
      setState(s)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeactivate() {
    await window.api.license.deactivate()
    setState({ status: 'none' })
    setKey('')
    setError('')
  }

  // Still loading
  if (!state) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        Verifying license…
      </div>
    )
  }

  // Hard block — expired past grace period or signature invalid
  if (state.status === 'expired' || state.status === 'invalid') {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16, padding: 40 }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>⚠</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-bright)' }}>
          {state.status === 'expired' ? 'License Expired' : 'Invalid License'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', maxWidth: 400 }}>
          {state.status === 'expired'
            ? `Your NetShell license expired on ${new Date(state.cert.expiresAt).toLocaleDateString()}. Renew to continue.`
            : (state as any).error}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <a
            href="https://netshell.app/renew"
            target="_blank"
            rel="noreferrer"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
          >
            Renew License
          </a>
          <button
            onClick={handleDeactivate}
            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 6, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
          >
            Enter New Key
          </button>
        </div>
        {state.status === 'expired' && (
          <ActivationForm keyVal={key} onKeyChange={setKey} onActivate={handleActivate} busy={busy} error={error} compact />
        )}
      </div>
    )
  }

  // No license — show full activation screen
  if (state.status === 'none') {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 20, padding: 40 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '-0.5px' }}>
          NetShell
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', maxWidth: 380 }}>
          Enter your license key to activate. Don't have one?{' '}
          <a href="https://netshell.app/buy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Purchase a license
          </a>
        </div>
        <ActivationForm keyVal={key} onKeyChange={setKey} onActivate={handleActivate} busy={busy} error={error} />
        <div style={{ fontSize: 11, color: 'var(--text-dim)', opacity: 0.5 }}>
          NetShell is a paid application. Licenses include 1 year of updates.
        </div>
      </div>
    )
  }

  // Grace period — show banner but let the app run
  if (state.status === 'grace' && !dismissed) {
    return (
      <>
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#5a3500', borderBottom: '1px solid #e3b341',
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', fontSize: 12,
        }}>
          <span style={{ color: '#e3b341', fontWeight: 600 }}>⚠ License expired</span>
          <span style={{ color: '#e3b341' }}>
            Your license expired {Math.abs(state.daysLeft)} day{Math.abs(state.daysLeft) !== 1 ? 's' : ''} ago.
            The app will stop working in {(state.cert.graceDays ?? 3) + state.daysLeft} day{(state.cert.graceDays ?? 3) + state.daysLeft !== 1 ? 's' : ''}.
          </span>
          <span style={{ flex: 1 }} />
          <a
            href="https://netshell.app/renew"
            target="_blank"
            rel="noreferrer"
            style={{ background: '#e3b341', color: '#000', borderRadius: 4, padding: '3px 12px', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}
          >
            Renew
          </a>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: '#e3b341', cursor: 'pointer', fontSize: 16, lineHeight: 1, opacity: 0.7 }}
          >
            ×
          </button>
        </div>
        <div style={{ paddingTop: 36 }}>{children}</div>
      </>
    )
  }

  // Valid (or grace with dismissed banner) — render the app
  return <>{children}</>
}

// ─── Shared activation form ──────────────────────────────────────────────────

interface FormProps {
  keyVal: string
  onKeyChange: (v: string) => void
  onActivate: () => void
  busy: boolean
  error: string
  compact?: boolean
}

function ActivationForm({ keyVal, onKeyChange, onActivate, busy, error, compact }: FormProps) {
  function handleKey(e: React.ChangeEvent<HTMLInputElement>) {
    // Auto-insert dashes: format as XXXX-XXXX-XXXX-XXXX
    let v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 16)
    v = v.replace(/(.{4})(?=.)/g, '$1-')
    onKeyChange(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: compact ? '100%' : 360, maxWidth: 400 }}>
      <input
        value={keyVal}
        onChange={handleKey}
        onKeyDown={e => { if (e.key === 'Enter') onActivate() }}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        disabled={busy}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: 16, letterSpacing: '0.1em',
          textAlign: 'center', padding: '10px 14px',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 6, color: 'var(--text-bright)', outline: 'none',
        }}
      />
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red, #f97583)', padding: '5px 10px', background: '#3d0000', borderRadius: 4 }}>
          {error}
        </div>
      )}
      <button
        onClick={onActivate}
        disabled={busy || keyVal.replace(/-/g, '').length < 16}
        style={{
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          color: 'var(--accent)', borderRadius: 6, padding: '9px 20px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          opacity: busy || keyVal.replace(/-/g, '').length < 16 ? 0.5 : 1,
        }}
      >
        {busy ? 'Activating…' : 'Activate License'}
      </button>
    </div>
  )
}
