import React from 'react'
import type { OpenTab } from '../types'

const TYPE_ICON: Record<string, string> = {
  ssh: '⌨',
  telnet: '⌨',
  serial: '⊞',
  meraki: '⬡',
}

const STATUS_COLOR: Record<string, string> = {
  connecting: 'var(--amber)',
  connected:  'var(--green)',
  disconnected: 'var(--text-dim)',
  error: 'var(--red)',
}

interface Props {
  tabs: OpenTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

export default function TabBar({ tabs, activeTabId, onActivate, onClose }: Props) {
  if (tabs.length === 0) return null

  return (
    <div style={{
      height: 'var(--tabbar-h)',
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'stretch',
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => onActivate(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 12px',
              minWidth: 120,
              maxWidth: 200,
              cursor: 'pointer',
              borderRight: '1px solid var(--border)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              background: isActive ? 'var(--bg)' : 'transparent',
              color: isActive ? 'var(--text-bright)' : 'var(--text-dim)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              userSelect: 'none',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 10 }}>{TYPE_ICON[tab.sessionType] ?? '⌨'}</span>
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {tab.title}
            </span>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[tab.status] ?? 'var(--text-dim)',
            }} />
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id) }}
              style={{
                background: 'none', border: 'none', color: 'var(--text-dim)',
                padding: '0 2px', fontSize: 14, lineHeight: 1, flexShrink: 0,
                borderRadius: 2,
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
