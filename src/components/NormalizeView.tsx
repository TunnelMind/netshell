/**
 * NormalizeView — unified vendor-neutral device view.
 * Four tabs: Interfaces | BGP Peers | ARP Table | Device Info.
 * Runs vendor-appropriate show commands via the normalize IPC handlers.
 */
import React, { useState } from 'react'
import type { OpenTab, NormalizedInterface, NormalizedBgpPeer, NormalizedArpEntry, NormalizedDeviceInfo, Vendor } from '../types'

interface Props {
  activeTab?: OpenTab
  onClose: () => void
}

type TabId = 'interfaces' | 'bgp' | 'arp' | 'device'

export default function NormalizeView({ activeTab, onClose }: Props) {
  const [activeNormTab, setActiveNormTab] = useState<TabId>('interfaces')
  const [interfaces, setInterfaces] = useState<NormalizedInterface[]>([])
  const [bgpPeers, setBgpPeers]     = useState<NormalizedBgpPeer[]>([])
  const [arpTable, setArpTable]     = useState<NormalizedArpEntry[]>([])
  const [deviceInfo, setDeviceInfo] = useState<NormalizedDeviceInfo | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleRefresh() {
    if (!activeTab?.connId) { setError('No active session.'); return }
    setLoading(true)
    setError('')

    const p = {
      connId: activeTab.connId,
      connType: activeTab.sessionType,
      vendor: (activeTab.detectedVendor ?? 'generic') as Vendor,
    }

    try {
      if (activeNormTab === 'interfaces') {
        const data = await window.api.normalize.interfaces(p)
        setInterfaces(data)
      } else if (activeNormTab === 'bgp') {
        const data = await window.api.normalize.bgp(p)
        setBgpPeers(data)
      } else if (activeNormTab === 'arp') {
        const data = await window.api.normalize.arp(p)
        setArpTable(data)
      } else {
        const data = await window.api.normalize.device(p)
        setDeviceInfo(data)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'interfaces', label: 'Interfaces' },
    { id: 'bgp',        label: 'BGP Peers' },
    { id: 'arp',        label: 'ARP Table' },
    { id: 'device',     label: 'Device Info' },
  ]

  const statusColor = (s: NormalizedInterface['status']) =>
    s === 'up' ? '#3fb950' : s === 'admin-down' ? '#e3b341' : '#f97583'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 860, maxHeight: '90vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Normalize View</span>
          <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>— {activeTab?.sessionName ?? 'no session'}</span>
          <span style={{ flex: 1 }} />
          <button onClick={handleRefresh} disabled={loading || !activeTab?.connId} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: 12 }}>
            {loading ? 'Loading…' : '↺ Refresh'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveNormTab(t.id)}
              style={{
                padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
                color: activeNormTab === t.id ? 'var(--fg)' : 'var(--fg-dim)',
                borderBottom: activeNormTab === t.id ? '2px solid #1f6feb' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div style={{ padding: '6px 14px', background: '#3d0e0e', color: '#f97583', fontSize: 12 }}>{error}</div>}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Interfaces */}
          {activeNormTab === 'interfaces' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg2)' }}>
                {['Interface', 'Status', 'IP', 'Speed', 'MTU', 'Errors In', 'Errors Out', 'Description'].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {interfaces.map((intf, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><code>{intf.name}</code></td>
                    <td style={{ ...td, color: statusColor(intf.status), fontWeight: 600 }}>{intf.status}</td>
                    <td style={td}>{intf.ipv4 ?? '—'}</td>
                    <td style={td}>{intf.speedMbps != null ? `${intf.speedMbps} Mbps` : '—'}</td>
                    <td style={td}>{intf.mtu ?? '—'}</td>
                    <td style={td}>{intf.errorIn ?? '—'}</td>
                    <td style={td}>{intf.errorOut ?? '—'}</td>
                    <td style={{ ...td, color: 'var(--fg-dim)' }}>{intf.description ?? ''}</td>
                  </tr>
                ))}
                {interfaces.length === 0 && <tr><td colSpan={8} style={{ padding: 14, color: 'var(--fg-dim)' }}>Click Refresh to load.</td></tr>}
              </tbody>
            </table>
          )}

          {/* BGP */}
          {activeNormTab === 'bgp' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg2)' }}>
                {['Neighbor', 'ASN', 'State', 'Prefixes Rcvd', 'Uptime'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {bgpPeers.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><code>{p.neighborAddress}</code></td>
                    <td style={td}>{p.asn}</td>
                    <td style={{ ...td, color: p.state === 'Established' ? '#3fb950' : '#f97583' }}>{p.state}</td>
                    <td style={td}>{p.prefixesReceived ?? '—'}</td>
                    <td style={td}>{p.uptimeSeconds != null ? formatUptime(p.uptimeSeconds) : '—'}</td>
                  </tr>
                ))}
                {bgpPeers.length === 0 && <tr><td colSpan={5} style={{ padding: 14, color: 'var(--fg-dim)' }}>Click Refresh to load.</td></tr>}
              </tbody>
            </table>
          )}

          {/* ARP */}
          {activeNormTab === 'arp' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg2)' }}>
                {['IP', 'MAC', 'Interface', 'Age (min)'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {arpTable.map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><code>{a.ip}</code></td>
                    <td style={td}><code>{a.mac}</code></td>
                    <td style={td}>{a.interface}</td>
                    <td style={td}>{a.age ?? '—'}</td>
                  </tr>
                ))}
                {arpTable.length === 0 && <tr><td colSpan={4} style={{ padding: 14, color: 'var(--fg-dim)' }}>Click Refresh to load.</td></tr>}
              </tbody>
            </table>
          )}

          {/* Device info */}
          {activeNormTab === 'device' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deviceInfo ? (
                [
                  ['Hostname',      deviceInfo.hostname],
                  ['Vendor',        deviceInfo.vendor],
                  ['Model',         deviceInfo.model],
                  ['Version',       deviceInfo.version],
                  ['Uptime',        deviceInfo.uptime],
                  ['Serial Number', deviceInfo.serialNumber],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', gap: 16, fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                    <span style={{ color: 'var(--fg-dim)', minWidth: 140 }}>{k}</span>
                    <span style={{ fontFamily: 'monospace' }}>{v}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--fg-dim)' }}>Click Refresh to load device information.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

const th: React.CSSProperties = { padding: '6px 12px', textAlign: 'left', fontSize: 11, color: 'var(--fg-dim)', fontWeight: 600, textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: '6px 12px' }
