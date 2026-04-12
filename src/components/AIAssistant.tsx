/**
 * AIAssistant — floating AI panel (Ctrl+Alt+A to toggle).
 * Uses local Ollama only — no external calls.
 * Supports command completion, terminal output explanation, and Q&A.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { OpenTab } from '../types'

interface Props {
  activeTab?: OpenTab
  terminalContext?: string   // last N lines from active terminal
  onSendToTerminal?: (text: string) => void
  onClose: () => void
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function AIAssistant({ activeTab, terminalContext, onSendToTerminal, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [busy, setBusy]         = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { unsubRef.current?.() }
  }, [])

  async function sendMessage(text: string, mode: 'qa' | 'explain' = 'qa') {
    if (!text.trim() || busy) return
    setBusy(true)
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])

    try {
      // Set up streaming listener
      unsubRef.current?.()
      unsubRef.current = window.api.ai.onStream((token: string) => {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { ...last, content: last.content + token }
          }
          return next
        })
        bottomRef.current?.scrollIntoView()
      })

      if (mode === 'explain' && terminalContext) {
        await window.api.ai.stream({
          vendor: activeTab?.detectedVendor,
          output: terminalContext,
          question: text,
        })
      } else {
        await window.api.ai.stream({
          vendor: activeTab?.detectedVendor,
          output: terminalContext ?? '',
          question: text,
        })
      }

      // Mark streaming done
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, streaming: false }
        }
        return next
      })
    } catch (e: any) {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: `Error: ${e.message}` }
        return next
      })
    } finally {
      setBusy(false)
      unsubRef.current?.()
    }
  }

  async function handleExplain() {
    if (!terminalContext) return
    await sendMessage('Explain this output', 'explain')
  }

  async function handleComplete() {
    if (!terminalContext) return
    const result = await window.api.ai.complete({
      vendor: activeTab?.detectedVendor,
      input: input,
    })
    setInput(result)
  }

  function handleSend(text: string) {
    sendMessage(text, 'qa')
  }

  const lastAssistant = messages.filter(m => m.role === 'assistant').pop()

  return (
    <div style={{
      position: 'fixed', bottom: 60, right: 20, width: 380, height: 500,
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px #0008', zIndex: 150,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', borderRadius: '8px 8px 0 0' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI Assistant</span>
        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--fg-dim)', background: '#1f6feb22', borderRadius: 3, padding: '1px 5px' }}>Ollama</span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--fg-dim)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            Ask a question, paste output to explain, or request a command.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.role === 'user' ? '#1f6feb' : 'var(--bg2)',
            color: m.role === 'user' ? '#fff' : 'var(--fg)',
            borderRadius: 8, padding: '6px 10px', maxWidth: '90%',
            fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {m.content}
            {m.streaming && <span style={{ opacity: 0.5 }}>▌</span>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px 0', flexWrap: 'wrap' }}>
        {terminalContext && (
          <button onClick={handleExplain} disabled={busy} style={quickBtn}>Explain output</button>
        )}
        {onSendToTerminal && lastAssistant?.content && !lastAssistant.streaming && (
          <button onClick={() => onSendToTerminal(lastAssistant.content)} style={quickBtn}>Send to terminal</button>
        )}
        <button onClick={handleComplete} disabled={busy || !terminalContext} style={quickBtn}>Complete command</button>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 6, padding: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
          placeholder="Ask anything… (Enter to send)"
          disabled={busy}
          style={{
            flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--fg)', padding: '6px 8px', fontSize: 12, outline: 'none',
          }}
        />
        <button onClick={() => handleSend(input)} disabled={busy || !input.trim()} style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
          {busy ? '…' : '→'}
        </button>
      </div>
    </div>
  )
}

const quickBtn: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--fg)', padding: '3px 8px', cursor: 'pointer', fontSize: 11,
}
