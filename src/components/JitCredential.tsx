/**
 * JitCredential — Just-In-Time approval overlay.
 * Shows when a credential has jitEnabled=true.
 * Posts a webhook request and waits for approve/deny from the callback server.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { CredentialMeta, JitRequest } from '../types'

interface Props {
  credential: CredentialMeta
  sessionName: string
  onApproved: () => void
  onDenied: () => void
  onCancel: () => void
}

export default function JitCredential({ credential, sessionName, onApproved, onDenied, onCancel }: Props) {
  const [request, setRequest] = useState<JitRequest | null>(null)
  const [reason, setReason]   = useState('')
  const [status, setStatus]   = useState<'idle' | 'requesting' | 'pending' | 'approved' | 'denied'>('idle')
  const [error, setError]     = useState('')
  const [ttlRemaining, setTtlRemaining] = useState<number | null>(null)
  const ttlTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubsRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const offApproved = window.api.jit.onApproved((req: JitRequest) => {
      if (req.credentialId !== credential.id) return
      setRequest(req)
      setStatus('approved')
      if (req.expiresAt) {
        startTtlCountdown(req.expiresAt)
      }
      onApproved()
    })
    const offDenied = window.api.jit.onDenied((req: JitRequest) => {
      if (req.credentialId !== credential.id) return
      setStatus('denied')
      onDenied()
    })
    unsubsRef.current = [offApproved, offDenied]

    return () => {
      unsubsRef.current.forEach(f => f())
      if (ttlTimer.current) clearInterval(ttlTimer.current)
    }
  }, [credential.id])

  function startTtlCountdown(expiresAt: number) {
    if (ttlTimer.current) clearInterval(ttlTimer.current)
    ttlTimer.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTtlRemaining(remaining)
      if (remaining <= 0) {
        if (ttlTimer.current) clearInterval(ttlTimer.current)
      }
    }, 1000)
  }

  async function handleRequest() {
    setStatus('requesting')
    setError('')
    try {
      const req = await window.api.jit.request({
        credentialId: credential.id,
        sessionName,
        requestedBy: 'netshell-user',
        reason: reason.trim() || undefined,
      })
      setRequest(req)
      setStatus('pending')
    } catch (e: any) {
      setError(e.message)
      setStatus('idle')
    }
  }

  function formatTtl(s: number): string {
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#000c',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: 380, background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>🔐 Access Approval Required</div>

        <div style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
          Credential <strong style={{ color: 'var(--fg)' }}>{credential.label}</strong> requires
          just-in-time approval before connecting to <strong style={{ color: 'var(--fg)' }}>{sessionName}</strong>.
        </div>

        {status === 'idle' && (
          <>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for access (optional)"
              rows={3}
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', padding: 8, fontSize: 12, resize: 'none', outline: 'none' }}
            />
            {error && <div style={{ color: '#f97583', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleRequest} style={{ flex: 1, background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 0', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Request Access
              </button>
              <button onClick={onCancel} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--fg)' }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {status === 'requesting' && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 13, textAlign: 'center', padding: 8 }}>Sending request…</div>
        )}

        {status === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>⏳</div>
            <div style={{ fontSize: 13, color: 'var(--fg-dim)', textAlign: 'center' }}>
              Approval request sent. Waiting for response…
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
              Request ID: <code style={{ color: 'var(--fg)' }}>{request?.requestId.slice(0, 8)}</code>
            </div>
            <button onClick={onCancel} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 20px', cursor: 'pointer', fontSize: 12, color: 'var(--fg)' }}>
              Cancel
            </button>
          </div>
        )}

        {status === 'approved' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontSize: 13, color: '#3fb950', fontWeight: 600 }}>Access Approved</div>
            {ttlRemaining != null && ttlRemaining > 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
                Grant expires in <strong style={{ color: ttlRemaining < 60 ? '#f97583' : 'var(--fg)' }}>{formatTtl(ttlRemaining)}</strong>
              </div>
            )}
          </div>
        )}

        {status === 'denied' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 28 }}>❌</div>
            <div style={{ fontSize: 13, color: '#f97583', fontWeight: 600 }}>Access Denied</div>
            <button onClick={onCancel} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 20px', cursor: 'pointer', fontSize: 12, color: 'var(--fg)' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
