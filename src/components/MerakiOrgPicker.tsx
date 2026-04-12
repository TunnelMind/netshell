import React, { useState, useEffect } from 'react'
import type { MerakiOrg, MerakiNetwork } from '../types'

interface Props {
  credentialId: string
  onSelect: (orgId: string, orgName: string, networkId: string, networkName: string) => void
  onClose: () => void
}

export default function MerakiOrgPicker({ credentialId, onSelect, onClose }: Props) {
  const [orgs, setOrgs]       = useState<MerakiOrg[]>([])
  const [networks, setNetworks] = useState<MerakiNetwork[]>([])
  const [selectedOrg, setSelectedOrg] = useState<MerakiOrg | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    window.api.meraki.listOrgs(credentialId)
      .then(setOrgs)
      .catch(e => setError(e.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [credentialId])

  const selectOrg = async (org: MerakiOrg) => {
    setSelectedOrg(org)
    setNetworks([])
    setLoading(true)
    try {
      const nets = await window.api.meraki.listNetworks(credentialId, org.id)
      setNetworks(nets)
    } catch (e: unknown) {
      setError((e as Error).message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  const confirm = (net: MerakiNetwork) => {
    if (!selectedOrg) return
    onSelect(selectedOrg.id, selectedOrg.name, net.id, net.name)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: 520, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: 13 }}>Browse Meraki Organizations</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 18 }}>×</button>
        </div>

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Loading...</div>
        )}
        {error && (
          <div style={{ padding: 16, color: 'var(--red)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Org list */}
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Organizations</div>
            {orgs.map(o => (
              <div
                key={o.id}
                onClick={() => selectOrg(o)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                  background: selectedOrg?.id === o.id ? 'var(--accent-dim)' : 'transparent',
                  color: selectedOrg?.id === o.id ? 'var(--accent)' : 'var(--text)',
                  borderLeft: selectedOrg?.id === o.id ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (selectedOrg?.id !== o.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                onMouseLeave={e => { if (selectedOrg?.id !== o.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                {o.name}
              </div>
            ))}
          </div>

          {/* Network list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Networks</div>
            {selectedOrg && networks.length === 0 && !loading && (
              <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-dim)' }}>No networks found.</div>
            )}
            {networks.map(n => (
              <div
                key={n.id}
                onClick={() => confirm(n)}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <span>{n.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{n.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
