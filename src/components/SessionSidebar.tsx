import React, { useState, useMemo } from 'react'
import type { Session } from '../types'

const TYPE_ICON: Record<string, string> = {
  ssh: '⌨', telnet: '⌨', serial: '⊞', meraki: '⬡', gnmi: '◈', k8s: '⎈', ssm: '☁',
}

interface Props {
  sessions: Session[]
  onOpen: (s: Session) => void
  onNew: () => void
  onEdit: (s: Session) => void
  onDelete: (id: string) => void
  onManageCreds: () => void
  onImport: () => void
  onScripts: () => void
  onSettings: () => void
  onSnippets: () => void
  onAudit: () => void
  onDiff: () => void
  onTftp: () => void
  // Phase 8 — new panel triggers
  onAI?: () => void
  onTopology?: () => void
  onGitops?: () => void
  onCompliance?: () => void
  onTemplates?: () => void
  onNormalize?: () => void
}

export default function SessionSidebar({ sessions, onOpen, onNew, onEdit, onDelete, onManageCreds, onImport, onScripts, onSettings, onSnippets, onAudit, onDiff, onTftp, onAI, onTopology, onGitops, onCompliance, onTemplates, onNormalize }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [ctxMenu, setCtxMenu] = useState<{ x: number, y: number, session: Session } | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q ? sessions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.host ?? '').toLowerCase().includes(q) ||
      s.group.toLowerCase().includes(q) ||
      s.notes.toLowerCase().includes(q)
    ) : sessions
  }, [sessions, query])

  const groups = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const s of filtered) {
      if (!map.has(s.group)) map.set(s.group, [])
      map.get(s.group)!.push(s)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const toggleGroup = (g: string) =>
    setCollapsed(prev => ({ ...prev, [g]: !prev[g] }))

  const handleContextMenu = (e: React.MouseEvent, session: Session) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, session })
  }

  return (
    <div
      style={{
        width: 'var(--sidebar-w)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
      onClick={() => ctxMenu && setCtxMenu(null)}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em' }}>
          NETSHELL
        </span>
        <button
          onClick={onNew}
          title="New session"
          style={{
            background: 'var(--accent-dim)', border: '1px solid var(--accent)', color: 'var(--accent)',
            borderRadius: 4, padding: '2px 8px', fontSize: 16, lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search sessions..."
          style={{ fontSize: 12, padding: '4px 8px' }}
        />
      </div>

      {/* Session groups */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {groups.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
            {query ? 'No results' : 'No sessions yet.\nClick + to add one.'}
          </div>
        )}
        {groups.map(([group, groupSessions]) => (
          <div key={group}>
            {/* Group header */}
            <div
              onClick={() => toggleGroup(group)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px 5px 12px',
                cursor: 'pointer',
                userSelect: 'none',
                color: 'var(--text-dim)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <span style={{
                fontSize: 8,
                transform: collapsed[group] ? 'rotate(-90deg)' : 'none',
                transition: 'transform 0.15s',
                display: 'inline-block',
              }}>▾</span>
              <span style={{ flex: 1 }}>{group}</span>
              <span style={{ fontSize: 9 }}>{groupSessions.length}</span>
            </div>

            {/* Sessions in group */}
            {!collapsed[group] && groupSessions.map(s => (
              <div
                key={s.id}
                onDoubleClick={() => onOpen(s)}
                onContextMenu={e => handleContextMenu(e, s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px 5px 22px',
                  cursor: 'default',
                  borderLeft: '2px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
                  ;(e.currentTarget as HTMLElement).style.borderLeftColor = 'var(--border)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent'
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
                  {TYPE_ICON[s.type] ?? '⌨'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, color: 'var(--text)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{s.name}</div>
                  {s.host && (
                    <div style={{
                      fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-mono)',
                    }}>{s.host}</div>
                  )}
                </div>
                {s.lastConnected && (
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>
                    {relativeTime(s.lastConnected)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <FooterBtn onClick={onManageCreds}>Creds</FooterBtn>
          <FooterBtn onClick={onImport}>Import</FooterBtn>
          <FooterBtn onClick={onSnippets}>Snippets</FooterBtn>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <FooterBtn onClick={onScripts}>Scripts</FooterBtn>
          <FooterBtn onClick={onDiff}>Diff</FooterBtn>
          <FooterBtn onClick={onTftp}>TFTP</FooterBtn>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <FooterBtn onClick={onAudit}>Audit Log</FooterBtn>
          <FooterBtn onClick={onSettings}>Settings</FooterBtn>
        </div>
        {(onAI || onTopology || onGitops || onCompliance || onTemplates || onNormalize) && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {onAI       && <FooterBtn onClick={onAI}>AI</FooterBtn>}
              {onTopology && <FooterBtn onClick={onTopology}>Topology</FooterBtn>}
              {onGitops   && <FooterBtn onClick={onGitops}>GitOps</FooterBtn>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {onCompliance && <FooterBtn onClick={onCompliance}>Compliance</FooterBtn>}
              {onTemplates  && <FooterBtn onClick={onTemplates}>Templates</FooterBtn>}
              {onNormalize  && <FooterBtn onClick={onNormalize}>Normalize</FooterBtn>}
            </div>
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div style={{
          position: 'fixed', left: ctxMenu.x, top: ctxMenu.y,
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 9999, minWidth: 140,
        }}>
          {[
            { label: 'Connect', action: () => onOpen(ctxMenu.session) },
            { label: 'Edit', action: () => onEdit(ctxMenu.session) },
            { label: 'Delete', action: () => {
              if (confirm(`Delete "${ctxMenu.session.name}"?`)) onDelete(ctxMenu.session.id)
            }, danger: true },
          ].map(item => (
            <div
              key={item.label}
              onClick={() => { item.action(); setCtxMenu(null) }}
              style={{
                padding: '7px 14px', cursor: 'pointer', fontSize: 12,
                color: item.danger ? 'var(--red)' : 'var(--text)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FooterBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, background: 'none', border: '1px solid var(--border)',
        color: 'var(--text-dim)', borderRadius: 4, padding: '3px 0', fontSize: 10,
      }}
    >
      {children}
    </button>
  )
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
