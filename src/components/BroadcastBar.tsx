import React from 'react'
import type { OpenTab, BroadcastTarget } from '../types'

interface Props {
  tabs: OpenTab[]
  targets: BroadcastTarget[]
  onToggle: (tab: OpenTab) => void
  onClear: () => void
}

const CONNECTABLE: OpenTab['sessionType'][] = ['ssh', 'serial', 'telnet']

export default function BroadcastBar({ tabs, targets, onToggle, onClear }: Props) {
  const connectedTabs = tabs.filter(t =>
    t.status === 'connected' &&
    CONNECTABLE.includes(t.sessionType) &&
    t.connId
  )

  if (connectedTabs.length < 2) return null

  const targetIds = new Set(targets.map(t => t.tabId))
  const active = targets.length > 0

  return (
    <div style={{
      background: active ? '#1a1400' : 'var(--bg3)',
      borderBottom: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
      padding: '4px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9,
        color: active ? 'var(--amber)' : 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        flexShrink: 0,
      }}>
        {active ? '◉ Broadcast' : '◎ Broadcast'}
      </span>

      {connectedTabs.map(tab => {
        const isSelected = targetIds.has(tab.id)
        return (
          <button
            key={tab.id}
            onClick={() => onToggle(tab)}
            style={{
              background: isSelected ? '#3a2800' : 'var(--bg2)',
              border: `1px solid ${isSelected ? 'var(--amber)' : 'var(--border)'}`,
              color: isSelected ? 'var(--amber)' : 'var(--text-dim)',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isSelected ? '✓ ' : ''}{tab.title}
          </button>
        )
      })}

      {active && (
        <button
          onClick={onClear}
          style={{
            background: 'none', border: '1px solid var(--border)',
            color: 'var(--text-dim)', borderRadius: 3, padding: '2px 8px', fontSize: 11,
            marginLeft: 'auto',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}
