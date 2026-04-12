import React, { useState, useEffect, useRef, useMemo } from 'react'
import type { Snippet } from '../types'

interface Props {
  snippets: Snippet[]
  onSend: (text: string) => void
  onClose: () => void
}

// Resolve {variable} placeholders — prompt user for each unique variable
function resolveVariables(command: string): string | null {
  const vars = Array.from(new Set(Array.from(command.matchAll(/\{(\w+)\}/g)).map(m => m[1])))
  if (vars.length === 0) return command
  const values: Record<string, string> = {}
  for (const v of vars) {
    const val = prompt(`Value for {${v}}:`)
    if (val === null) return null // cancelled
    values[v] = val
  }
  return command.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')
}

export default function SnippetPicker({ snippets, onSend, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return q
      ? snippets.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some(t => t.toLowerCase().includes(q))
        )
      : snippets
  }, [snippets, query])

  useEffect(() => { setSelected(0) }, [filtered])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); send(filtered[selected]) }
    if (e.key === 'Escape')    { onClose() }
  }

  const send = (s: Snippet | undefined) => {
    if (!s) return
    const resolved = resolveVariables(s.command)
    if (resolved !== null) {
      onSend(resolved + '\r')
    }
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, zIndex: 2000 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: 480, maxHeight: 400, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }}
      >
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search snippets... (Ctrl+Space)"
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              No snippets found.
            </div>
          )}
          {filtered.map((s, i) => (
            <div
              key={s.id}
              onClick={() => send(s)}
              style={{
                padding: '8px 14px',
                background: i === selected ? 'var(--accent-dim)' : 'transparent',
                cursor: 'pointer',
                borderLeft: i === selected ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-bright)', fontWeight: 500 }}>{s.name}</span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {s.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, color: 'var(--text-dim)', background: 'var(--bg3)', borderRadius: 2, padding: '1px 5px', fontFamily: 'var(--font-mono)' }}>{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.command}
              </div>
              {s.description && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{s.description}</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 16 }}>
          <span>↑↓ navigate</span>
          <span>↵ send</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
