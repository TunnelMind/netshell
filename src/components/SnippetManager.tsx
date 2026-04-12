import React, { useState, useEffect } from 'react'
import type { Snippet } from '../types'

const EMPTY: Omit<Snippet, 'id'> = { name: '', command: '', description: '', tags: [] }

export default function SnippetManager({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [selected, setSelected] = useState<Snippet | null>(null)
  const [form, setForm] = useState<Omit<Snippet, 'id'>>(EMPTY)
  const [tagsInput, setTagsInput] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    const s = await window.api.snippets.getAll()
    setSnippets(s)
  }

  useEffect(() => { load() }, [])

  const selectSnippet = (s: Snippet) => {
    setSelected(s)
    setForm({ name: s.name, command: s.command, description: s.description, tags: s.tags })
    setTagsInput(s.tags.join(', '))
  }

  const newSnippet = () => {
    setSelected(null)
    setForm(EMPTY)
    setTagsInput('')
  }

  const save = async () => {
    if (!form.name.trim()) return
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    const snippet = await window.api.snippets.save({ ...form, tags, id: selected?.id ?? '' } as Snippet)
    setSelected(snippet)
    await load()
    onRefresh()
  }

  const del = async () => {
    if (!selected) return
    if (!confirm(`Delete snippet "${selected.name}"?`)) return
    await window.api.snippets.delete(selected.id)
    setSelected(null)
    setForm(EMPTY)
    setTagsInput('')
    await load()
    onRefresh()
  }

  const filtered = query
    ? snippets.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      )
    : snippets

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, width: 680, height: '75vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)' }}>Snippet Manager</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 16 }}>✕</button>
        </div>

        {/* Body: two panels */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: snippet list */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={newSnippet} style={{
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 4, padding: '4px 0', fontSize: 11,
              }}>+ New Snippet</button>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter snippets…"
                style={{ fontSize: 11, padding: '4px 8px' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 11, textAlign: 'center' }}>
                  {query ? 'No results' : 'No snippets yet'}
                </div>
              )}
              {filtered.map(s => (
                <div
                  key={s.id}
                  onClick={() => selectSnippet(s)}
                  style={{
                    padding: '7px 12px', cursor: 'pointer',
                    background: selected?.id === s.id ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: `2px solid ${selected?.id === s.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <div style={{ fontSize: 12, color: selected?.id === s.id ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
                    {s.tags.map(t => (
                      <span key={t} style={{
                        fontSize: 9, background: 'var(--bg3)', color: 'var(--text-dim)',
                        borderRadius: 2, padding: '1px 4px', fontFamily: 'var(--font-mono)',
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: editor */}
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Show BGP Summary"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                Command <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>({'{variable}'} for prompts)</span>
              </label>
              <textarea
                value={form.command}
                onChange={e => setForm(prev => ({ ...prev, command: e.target.value }))}
                placeholder="show bgp {neighbor} summary"
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Description</label>
              <input
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what this does"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Tags (comma-separated)</label>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="ios, bgp, routing"
              />
              {tagsInput && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {tagsInput.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} style={{
                      fontSize: 10, background: 'var(--accent-dim)', color: 'var(--accent)',
                      borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono)',
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--border)', padding: '8px 16px',
          display: 'flex', gap: 8, justifyContent: 'space-between',
        }}>
          {selected && (
            <button onClick={del} style={{
              background: 'none', border: '1px solid var(--red)', color: 'var(--red)',
              borderRadius: 4, padding: '4px 12px', fontSize: 11,
            }}>Delete</button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
              borderRadius: 4, padding: '6px 16px',
            }}>Close</button>
            <button onClick={save} style={{
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              color: 'var(--accent)', borderRadius: 4, padding: '6px 16px', fontWeight: 600,
            }}>{selected ? 'Save' : 'Create'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
