/**
 * TemplateEditor — config template library with nunjucks rendering.
 * Supports Jinja2-compatible syntax for network engineers familiar with Ansible.
 */
import React, { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { ConfigTemplate, TemplateVariable, Vendor } from '../types'

interface Props {
  onSendToTerminal?: (text: string) => void
  onClose: () => void
}

const EMPTY_TMPL: ConfigTemplate = {
  id: '', name: '', vendor: 'generic', description: '',
  template: '', variables: [], tags: [],
}

const VENDORS: Vendor[] = ['ios', 'iosxe', 'iosxr', 'nxos', 'junos', 'eos', 'generic']

export default function TemplateEditor({ onSendToTerminal, onClose }: Props) {
  const [templates, setTemplates] = useState<ConfigTemplate[]>([])
  const [selected, setSelected]   = useState<ConfigTemplate | null>(null)
  const [editing, setEditing]     = useState<ConfigTemplate>(EMPTY_TMPL)
  const [rendered, setRendered]   = useState<string>('')
  const [renderError, setRenderError] = useState<string>('')
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [showRender, setShowRender] = useState(false)
  const [status, setStatus]       = useState('')

  useEffect(() => {
    window.api.templates.getAll().then(ts => {
      setTemplates(ts)
      if (ts.length > 0) selectTemplate(ts[0])
    })
  }, [])

  function selectTemplate(t: ConfigTemplate) {
    setSelected(t)
    setEditing({ ...t })
    setShowRender(false)
    setRendered('')
    setRenderError('')
    const vals: Record<string, string> = {}
    t.variables.forEach(v => { vals[v.name] = v.default ?? '' })
    setVarValues(vals)
  }

  function handleNew() {
    const blank: ConfigTemplate = { ...EMPTY_TMPL, id: uuidv4() }
    setSelected(null)
    setEditing(blank)
    setShowRender(false)
    setVarValues({})
  }

  async function handleSave() {
    const saved = await window.api.templates.save(editing)
    setTemplates(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      return idx >= 0 ? prev.map((t, i) => i === idx ? saved : t) : [...prev, saved]
    })
    setSelected(saved)
    setStatus('Saved.')
    setTimeout(() => setStatus(''), 2000)
  }

  async function handleDelete() {
    if (!editing.id) return
    if (!confirm(`Delete "${editing.name}"?`)) return
    await window.api.templates.delete(editing.id)
    const remaining = templates.filter(t => t.id !== editing.id)
    setTemplates(remaining)
    if (remaining.length > 0) selectTemplate(remaining[0])
    else { setSelected(null); setEditing(EMPTY_TMPL) }
  }

  async function handleRender() {
    setRenderError('')
    setRendered('')
    const result = await window.api.templates.render({ templateId: editing.id, variables: varValues })
    if (result.error) {
      setRenderError(result.error)
    } else {
      setRendered(result.rendered ?? '')
      setShowRender(true)
    }
  }

  function addVariable() {
    const v: TemplateVariable = { name: 'new_var', label: 'New Variable', type: 'string', required: false }
    setEditing(prev => ({ ...prev, variables: [...prev.variables, v] }))
  }

  function updateVariable(idx: number, patch: Partial<TemplateVariable>) {
    setEditing(prev => {
      const vars = [...prev.variables]
      vars[idx] = { ...vars[idx], ...patch }
      return { ...prev, variables: vars }
    })
  }

  function removeVariable(idx: number) {
    setEditing(prev => ({ ...prev, variables: prev.variables.filter((_, i) => i !== idx) }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '92vw', maxWidth: 1100, height: '88vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Config Templates</span>
          <span style={{ flex: 1 }} />
          {status && <span style={{ fontSize: 12, color: '#3fb950', marginRight: 12 }}>{status}</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8 }}>
              <button onClick={handleNew} style={{ width: '100%', background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 0', cursor: 'pointer', fontSize: 12 }}>
                + New Template
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                    background: selected?.id === t.id ? '#1f6feb22' : 'transparent',
                    borderLeft: selected?.id === t.id ? '2px solid #1f6feb' : '2px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{t.name || '(unnamed)'}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{t.vendor}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Main area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Fields */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={editing.name}
                onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                placeholder="Template name"
                style={inputStyle}
              />
              <select
                value={editing.vendor}
                onChange={e => setEditing(p => ({ ...p, vendor: e.target.value as Vendor }))}
                style={{ ...inputStyle, width: 120 }}
              >
                {VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <input
                value={editing.description}
                onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                placeholder="Description"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handleSave} style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 12 }}>Save</button>
              <button onClick={handleDelete} disabled={!editing.id} style={{ background: '#8b0000', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 12 }}>Delete</button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Template textarea */}
              <div style={{ flex: showRender ? 0 : 1, display: showRender ? 'none' : 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '6px 14px' }}>
                  Template (Nunjucks/Jinja2 syntax — use {'{{'}variable{'}}'}):
                </div>
                <textarea
                  value={editing.template}
                  onChange={e => setEditing(p => ({ ...p, template: e.target.value }))}
                  style={{ flex: 1, background: 'var(--bg2)', border: 'none', color: 'var(--fg)', padding: 12, fontFamily: 'monospace', fontSize: 12, resize: 'none', outline: 'none' }}
                  placeholder={'hostname {{ hostname }}\n!\ninterface {{ interface }}\n ip address {{ ip_address }} {{ subnet_mask }}\n no shutdown'}
                />
              </div>

              {/* Render output */}
              {showRender && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Rendered output:</span>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setShowRender(false)} style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', fontSize: 11 }}>← Back to editor</button>
                    {onSendToTerminal && (
                      <button onClick={() => onSendToTerminal(rendered)} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>Send to terminal</button>
                    )}
                    <button onClick={() => navigator.clipboard.writeText(rendered)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--fg)' }}>Copy</button>
                  </div>
                  {renderError ? (
                    <div style={{ padding: 12, color: '#f97583', fontSize: 12, fontFamily: 'monospace' }}>{renderError}</div>
                  ) : (
                    <pre style={{ flex: 1, margin: 0, padding: 12, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, color: '#3fb950', background: '#0a1a10' }}>
                      {rendered}
                    </pre>
                  )}
                </div>
              )}

              {/* Variables panel */}
              <div style={{ width: 280, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                  <span>Variables</span>
                  <button onClick={addVariable} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 7px', cursor: 'pointer', fontSize: 11, color: 'var(--fg)' }}>+ Add</button>
                  <span style={{ flex: 1 }} />
                  <button onClick={handleRender} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>Render ▶</button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {editing.variables.map((v, idx) => (
                    <div key={idx} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <input
                          value={v.name}
                          onChange={e => updateVariable(idx, { name: e.target.value })}
                          style={{ ...inputStyle, width: 100, fontSize: 11 }}
                          placeholder="var_name"
                        />
                        <select value={v.type} onChange={e => updateVariable(idx, { type: e.target.value as TemplateVariable['type'] })} style={{ ...inputStyle, fontSize: 11, width: 80 }}>
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="select">select</option>
                        </select>
                        <button onClick={() => removeVariable(idx)} style={{ background: 'none', border: 'none', color: '#f97583', cursor: 'pointer', fontSize: 14 }}>×</button>
                      </div>
                      <input
                        value={varValues[v.name] ?? v.default ?? ''}
                        onChange={e => setVarValues(p => ({ ...p, [v.name]: e.target.value }))}
                        placeholder={`Value for ${v.name}`}
                        style={{ ...inputStyle, width: '100%', fontSize: 11 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--fg)', padding: '4px 8px', fontSize: 12, outline: 'none',
}
