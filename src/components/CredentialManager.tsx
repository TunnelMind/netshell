import React, { useState } from 'react'
import type { CredentialMeta } from '../types'

interface Props {
  credentials: CredentialMeta[]
  onRefresh: () => void
  onClose: () => void
}

interface EditState {
  meta: Partial<CredentialMeta>
  password: string
  apiToken: string
  passphrase: string
  mode: 'ssh' | 'meraki'
}

function emptyEdit(): EditState {
  return { meta: { label: '', username: '' }, password: '', apiToken: '', passphrase: '', mode: 'ssh' }
}

export default function CredentialManager({ credentials, onRefresh, onClose }: Props) {
  const [edit, setEdit] = useState<EditState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const startNew = () => { setEditingId(null); setEdit(emptyEdit()) }

  const startEdit = (c: CredentialMeta) => {
    setEditingId(c.id)
    setEdit({ meta: { ...c }, password: '', apiToken: '', passphrase: '', mode: 'ssh' })
  }

  const handleSave = async () => {
    if (!edit || !edit.meta.label?.trim()) return
    const meta: CredentialMeta = {
      id: editingId ?? '',
      label: edit.meta.label!,
      username: edit.meta.username,
      vaultPath: edit.meta.vaultPath,
    }
    const secrets: Record<string, string> = {}
    if (edit.password) secrets.password = edit.password
    if (edit.apiToken) secrets.apiToken = edit.apiToken
    if (edit.passphrase) secrets.privateKeyPassphrase = edit.passphrase
    await window.api.credentials.save(meta, secrets)
    await onRefresh()
    setEdit(null)
    setEditingId(null)
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete credential "${label}"?`)) return
    await window.api.credentials.delete(id)
    await onRefresh()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 8, width: 500, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>Credentials</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={startNew}
              style={{
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 4, padding: '4px 12px', fontSize: 12,
              }}
            >+ New</button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18, padding: '0 4px' }}
            >×</button>
          </div>
        </div>

        {/* Credential list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {credentials.length === 0 && (
            <div style={{ padding: '24px 20px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              No credentials saved. Click "+ New" to add one.
            </div>
          )}
          {credentials.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 20px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.label}</div>
                {c.username && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {c.username}
                  </div>
                )}
                {c.vaultPath && (
                  <div style={{ fontSize: 10, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
                    vault: {c.vaultPath}
                  </div>
                )}
              </div>
              <button
                onClick={() => startEdit(c)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 3, padding: '3px 10px', fontSize: 11 }}
              >Edit</button>
              <button
                onClick={() => handleDelete(c.id, c.label)}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: 3, padding: '3px 10px', fontSize: 11 }}
              >Del</button>
            </div>
          ))}
        </div>

        {/* Edit form */}
        {edit && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg3)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              {editingId ? 'Edit credential — leave password blank to keep existing' : 'New credential'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormRow label="Label">
                <input
                  value={edit.meta.label ?? ''}
                  onChange={e => setEdit(prev => prev ? { ...prev, meta: { ...prev.meta, label: e.target.value } } : prev)}
                  placeholder="e.g. Corp Network Admin"
                  autoFocus
                />
              </FormRow>
              <FormRow label="Username">
                <input
                  value={edit.meta.username ?? ''}
                  onChange={e => setEdit(prev => prev ? { ...prev, meta: { ...prev.meta, username: e.target.value } } : prev)}
                  placeholder="admin"
                />
              </FormRow>
              <FormRow label="Password">
                <input
                  type="password"
                  value={edit.password}
                  onChange={e => setEdit(prev => prev ? { ...prev, password: e.target.value } : prev)}
                  placeholder={editingId ? '(unchanged)' : 'SSH / Telnet password'}
                />
              </FormRow>
              <FormRow label="API Token">
                <input
                  type="password"
                  value={edit.apiToken}
                  onChange={e => setEdit(prev => prev ? { ...prev, apiToken: e.target.value } : prev)}
                  placeholder="Meraki Dashboard API key"
                />
              </FormRow>
              <FormRow label="Key Pass">
                <input
                  type="password"
                  value={edit.passphrase}
                  onChange={e => setEdit(prev => prev ? { ...prev, passphrase: e.target.value } : prev)}
                  placeholder="SSH private key passphrase"
                />
              </FormRow>
              <FormRow label="Vault Path">
                <input
                  value={edit.meta.vaultPath ?? ''}
                  onChange={e => setEdit(prev => prev ? { ...prev, meta: { ...prev.meta, vaultPath: e.target.value } } : prev)}
                  placeholder="secret/data/network/admin (optional)"
                />
              </FormRow>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => { setEdit(null); setEditingId(null) }}
                style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '5px 14px', fontSize: 12 }}
              >Cancel</button>
              <button
                onClick={handleSave}
                style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 4, padding: '5px 14px', fontSize: 12, fontWeight: 600 }}
              >Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FormRow({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 80, flexShrink: 0, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}
