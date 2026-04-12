import React, { useState, useEffect } from 'react'
import type { Session, CredentialMeta, SessionType, AuthType } from '../types'
import MerakiOrgPicker from './MerakiOrgPicker'

// K8s context/pod lists loaded lazily when type === 'k8s'
interface K8sContext { name: string; cluster: string; user: string; current: boolean }
interface K8sPod { name: string; namespace: string; containers: string[] }

const EMPTY: Omit<Session, 'id'> = {
  name: '',
  type: 'ssh',
  group: '',
  notes: '',
  connectionCount: 0,
  host: '',
  port: 22,
  authType: 'password',
  logEnabled: false,
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
}

interface Props {
  session: Session | null
  credentials: CredentialMeta[]
  onSave: (s: Session) => void
  onClose: () => void
}

export default function SessionForm({ session, credentials, onSave, onClose }: Props) {
  const [form, setForm] = useState<Omit<Session, 'id'>>(() => ({
    ...EMPTY,
    ...(session ?? {}),
  }))
  const [serialPorts, setSerialPorts] = useState<{ path: string; manufacturer: string }[]>([])
  const [showOrgPicker, setShowOrgPicker] = useState(false)
  const [k8sContexts, setK8sContexts] = useState<K8sContext[]>([])
  const [k8sPods, setK8sPods]         = useState<K8sPod[]>([])
  const [ssmInstances, setSsmInstances] = useState<{ instanceId: string; name: string }[]>([])

  useEffect(() => {
    window.api.serial.list().then(setSerialPorts).catch(() => {})
  }, [])

  useEffect(() => {
    if (form.type === 'k8s') {
      window.api.k8s.listContexts().then(setK8sContexts).catch(() => {})
    }
    if (form.type === 'ssm') {
      window.api.ssm.listInstances({ region: form.ssmRegion, profile: form.ssmProfile }).then(setSsmInstances).catch(() => {})
    }
  }, [form.type])

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({ ...form, id: session?.id ?? '' } as Session)
  }

  const isSSH    = form.type === 'ssh' || form.type === 'telnet'
  const isSerial = form.type === 'serial'
  const isMeraki = form.type === 'meraki'
  const isGnmi   = form.type === 'gnmi'
  const isK8s    = form.type === 'k8s'
  const isSsm    = form.type === 'ssm'

  return (
    <>
    <Overlay onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 4 }}>
          {session ? 'Edit Session' : 'New Session'}
        </div>

        <Row label="Type">
          <select value={form.type} onChange={e => {
            const t = e.target.value as SessionType
            set('type', t)
            if (t === 'telnet') set('port', 23)
            else if (t === 'ssh') set('port', 22)
          }}>
            <option value="ssh">SSH</option>
            <option value="telnet">Telnet</option>
            <option value="serial">Serial / Console</option>
            <option value="meraki">Meraki CLI</option>
            <option value="gnmi">gNMI Telemetry</option>
            <option value="k8s">Kubernetes Exec</option>
            <option value="ssm">AWS SSM</option>
          </select>
        </Row>

        <Row label="Name">
          <input
            required
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. sw-nyc-core-01"
            autoFocus
          />
        </Row>

        {(isSSH || isMeraki) && (
          <Row label="Host / IP">
            <input
              value={form.host ?? ''}
              onChange={e => set('host', e.target.value)}
              placeholder="192.168.1.1 or hostname.example.com"
            />
          </Row>
        )}

        {isSSH && (
          <Row label="Port">
            <input
              type="number"
              value={form.port ?? 22}
              onChange={e => set('port', parseInt(e.target.value, 10))}
              style={{ width: 80 }}
            />
          </Row>
        )}

        {isSerial && (
          <>
            <Row label="Port">
              {serialPorts.length > 0 ? (
                <select value={form.serialPort ?? ''} onChange={e => set('serialPort', e.target.value)}>
                  <option value="">— Select port —</option>
                  {serialPorts.map(p => (
                    <option key={p.path} value={p.path}>
                      {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.serialPort ?? ''}
                  onChange={e => set('serialPort', e.target.value)}
                  placeholder="COM3 or /dev/ttyUSB0"
                />
              )}
            </Row>
            <Row label="Baud Rate">
              <select value={form.baudRate ?? 9600} onChange={e => set('baudRate', parseInt(e.target.value, 10))}>
                {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Row>
            <Row label="Data / Parity / Stop">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.dataBits ?? 8} onChange={e => set('dataBits', parseInt(e.target.value, 10) as 5|6|7|8)} style={{ flex: 1 }}>
                  {[5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={form.parity ?? 'none'} onChange={e => set('parity', e.target.value as 'none'|'even'|'odd')} style={{ flex: 1 }}>
                  <option value="none">None</option>
                  <option value="even">Even</option>
                  <option value="odd">Odd</option>
                </select>
                <select value={form.stopBits ?? 1} onChange={e => set('stopBits', parseInt(e.target.value, 10) as 1|2)} style={{ flex: 1 }}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
            </Row>
          </>
        )}

        {(isSSH) && (
          <Row label="Auth Type">
            <select value={form.authType ?? 'password'} onChange={e => set('authType', e.target.value as AuthType)}>
              <option value="password">Password</option>
              <option value="key">SSH Key</option>
            </select>
          </Row>
        )}

        {form.authType === 'key' && isSSH && (
          <Row label="Key File">
            <input
              value={form.privateKeyPath ?? ''}
              onChange={e => set('privateKeyPath', e.target.value)}
              placeholder="/home/user/.ssh/id_rsa"
            />
          </Row>
        )}

        {!isSerial && (
          <Row label="Credential">
            <select
              value={form.credentialId ?? ''}
              onChange={e => set('credentialId', e.target.value || undefined)}
            >
              <option value="">— None —</option>
              {credentials.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Row>
        )}

        {isMeraki && (
          <>
            <Row label="Org ID">
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={form.orgId ?? ''}
                  onChange={e => set('orgId', e.target.value)}
                  placeholder="Optional"
                  style={{ flex: 1 }}
                />
                {form.credentialId && (
                  <button
                    type="button"
                    onClick={() => setShowOrgPicker(true)}
                    style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
                  >
                    Browse
                  </button>
                )}
              </div>
            </Row>
            <Row label="Network ID">
              <input
                value={form.networkId ?? ''}
                onChange={e => set('networkId', e.target.value)}
                placeholder="Auto-filled when you browse"
              />
            </Row>
          </>
        )}

        {isGnmi && (
          <>
            <Row label="Host / IP">
              <input value={form.host ?? ''} onChange={e => set('host', e.target.value)} placeholder="192.168.1.1" />
            </Row>
            <Row label="gNMI Port">
              <input type="number" value={form.gnmiPort ?? 9339} onChange={e => set('gnmiPort', parseInt(e.target.value, 10))} style={{ width: 80 }} />
            </Row>
            <Row label="Insecure TLS">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
                <input type="checkbox" checked={!!form.gnmiInsecure} onChange={e => set('gnmiInsecure', e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Skip TLS verification</span>
              </label>
            </Row>
            <Row label="Subscribe Paths">
              <textarea
                value={(form.gnmiPaths ?? []).join('\n')}
                onChange={e => set('gnmiPaths', e.target.value.split('\n').filter(Boolean))}
                rows={4}
                placeholder="/interfaces/interface[name=*]/state&#10;/system/memory/state"
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
              />
            </Row>
          </>
        )}

        {isK8s && (
          <>
            <Row label="Context">
              <select value={form.k8sContext ?? ''} onChange={e => {
                set('k8sContext', e.target.value || undefined)
                if (e.target.value) {
                  window.api.k8s.listPods({ context: e.target.value, namespace: form.k8sNamespace ?? 'default' }).then(setK8sPods).catch(() => {})
                }
              }}>
                <option value="">— default —</option>
                {k8sContexts.map(c => <option key={c.name} value={c.name}>{c.name}{c.current ? ' (current)' : ''}</option>)}
              </select>
            </Row>
            <Row label="Namespace">
              <input value={form.k8sNamespace ?? 'default'} onChange={e => set('k8sNamespace', e.target.value)} placeholder="default" />
            </Row>
            <Row label="Pod">
              {k8sPods.length > 0 ? (
                <select value={form.k8sPod ?? ''} onChange={e => {
                  set('k8sPod', e.target.value)
                  const pod = k8sPods.find(p => p.name === e.target.value)
                  if (pod?.containers.length === 1) set('k8sContainer', pod.containers[0])
                }}>
                  <option value="">— Select pod —</option>
                  {k8sPods.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              ) : (
                <input value={form.k8sPod ?? ''} onChange={e => set('k8sPod', e.target.value)} placeholder="my-pod-abc123" />
              )}
            </Row>
            <Row label="Container">
              <input value={form.k8sContainer ?? ''} onChange={e => set('k8sContainer', e.target.value)} placeholder="(first container if blank)" />
            </Row>
          </>
        )}

        {isSsm && (
          <>
            <Row label="AWS Region">
              <input value={form.ssmRegion ?? ''} onChange={e => set('ssmRegion', e.target.value)} placeholder="us-east-1" />
            </Row>
            <Row label="AWS Profile">
              <input value={form.ssmProfile ?? ''} onChange={e => set('ssmProfile', e.target.value)} placeholder="default" />
            </Row>
            <Row label="Instance ID">
              {ssmInstances.length > 0 ? (
                <select value={form.ssmInstanceId ?? ''} onChange={e => set('ssmInstanceId', e.target.value)}>
                  <option value="">— Select instance —</option>
                  {ssmInstances.map(i => <option key={i.instanceId} value={i.instanceId}>{i.name} ({i.instanceId})</option>)}
                </select>
              ) : (
                <input value={form.ssmInstanceId ?? ''} onChange={e => set('ssmInstanceId', e.target.value)} placeholder="i-0abc1234567890def" />
              )}
            </Row>
          </>
        )}

        <Row label="Group">
          <input
            value={form.group}
            onChange={e => set('group', e.target.value)}
            placeholder="Auto-derived from hostname if left blank"
          />
        </Row>

        <Row label="Notes">
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Rack location, role, etc."
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </Row>

        <Row label="Log session">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
            <input
              type="checkbox"
              checked={form.logEnabled}
              onChange={e => set('logEnabled', e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Save transcript to disk</span>
          </label>
        </Row>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
            padding: '6px 16px', borderRadius: 4,
          }}>Cancel</button>
          <button type="submit" style={{
            background: 'var(--accent-dim)', border: '1px solid var(--accent)',
            color: 'var(--accent)', padding: '6px 16px', borderRadius: 4, fontWeight: 600,
          }}>
            {session ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Overlay>
    {showOrgPicker && form.credentialId && (
      <MerakiOrgPicker
        credentialId={form.credentialId}
        onSelect={(orgId, _orgName, networkId, _networkName) => {
          set('orgId', orgId)
          set('networkId', networkId)
          setShowOrgPicker(false)
        }}
        onClose={() => setShowOrgPicker(false)}
      />
    )}
    </>
  )
}

function Row({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 100, flexShrink: 0, fontSize: 12, color: 'var(--text-dim)',
        paddingTop: 7, textAlign: 'right',
      }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 24, width: 480, maxHeight: '80vh',
          overflowY: 'auto', boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
