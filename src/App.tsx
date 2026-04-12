import React, { useState, useEffect, useCallback } from 'react'
import SessionSidebar from './components/SessionSidebar'
import TabBar from './components/TabBar'
import TerminalTab from './components/TerminalTab'
import SessionForm from './components/SessionForm'
import CredentialManager from './components/CredentialManager'
import BroadcastBar from './components/BroadcastBar'
import SnippetPicker from './components/SnippetPicker'
import type { Session, CredentialMeta, OpenTab, Snippet, BroadcastTarget } from './types'

export default function App() {
  const [sessions,     setSessions]     = useState<Session[]>([])
  const [credentials,  setCredentials]  = useState<CredentialMeta[]>([])
  const [snippets,     setSnippets]     = useState<Snippet[]>([])
  const [tabs,         setTabs]         = useState<OpenTab[]>([])
  const [activeTabId,  setActiveTabId]  = useState<string | null>(null)
  const [broadcast,    setBroadcast]    = useState<BroadcastTarget[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const [editSession,  setEditSession]  = useState<Session | null>(null)
  const [showCreds,    setShowCreds]    = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)

  const loadData = useCallback(async () => {
    const [s, c, sn] = await Promise.all([
      window.api.sessions.getAll(),
      window.api.credentials.getAll(),
      window.api.snippets.getAll(),
    ])
    setSessions(s)
    setCredentials(c)
    setSnippets(sn)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Ctrl+Space → snippet picker
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        setShowSnippets(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const openSession = useCallback((session: Session) => {
    const existing = tabs.find(t => t.sessionId === session.id && t.status !== 'disconnected')
    if (existing) { setActiveTabId(existing.id); return }
    const tabId = `tab-${Date.now()}`
    setTabs(prev => [...prev, {
      id: tabId, sessionId: session.id,
      sessionName: session.name, sessionType: session.type,
      status: 'connecting', title: session.name,
    }])
    setActiveTabId(tabId)
  }, [tabs])

  const closeTab = useCallback((tabId: string) => {
    setBroadcast(prev => prev.filter(t => t.tabId !== tabId))
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId)
      setActiveTabId(cur => {
        if (cur !== tabId) return cur
        return remaining.length > 0 ? remaining[remaining.length - 1].id : null
      })
      return remaining
    })
  }, [])

  const updateTab = useCallback((tabId: string, patch: Partial<OpenTab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...patch } : t))
  }, [])

  const handleSaveSession = async (session: Session) => {
    const saved = await window.api.sessions.save(session)
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === saved.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n }
      return [...prev, saved]
    })
    setShowSessions(false)
    setEditSession(null)
  }

  const handleDeleteSession = async (id: string) => {
    await window.api.sessions.delete(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setTabs(prev => prev.filter(t => t.sessionId !== id))
  }

  const toggleBroadcast = (tab: OpenTab) => {
    if (!tab.connId) return
    setBroadcast(prev => {
      const already = prev.find(t => t.tabId === tab.id)
      if (already) return prev.filter(t => t.tabId !== tab.id)
      return [...prev, { tabId: tab.id, connId: tab.connId!, type: tab.sessionType }]
    })
  }

  const sendSnippet = async (text: string) => {
    if (broadcast.length > 0) {
      await window.api.broadcast.write(broadcast, text)
      return
    }
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab?.connId) return
    if (activeTab.sessionType === 'ssh')    window.api.ssh.write(activeTab.connId, text)
    if (activeTab.sessionType === 'serial') window.api.serial.write(activeTab.connId, text)
    if (activeTab.sessionType === 'telnet') window.api.telnet.write(activeTab.connId, text)
  }

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <SessionSidebar
        sessions={sessions}
        onOpen={openSession}
        onNew={() => { setEditSession(null); setShowSessions(true) }}
        onEdit={s => { setEditSession(s); setShowSessions(true) }}
        onDelete={handleDeleteSession}
        onManageCreds={() => setShowCreds(true)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={closeTab}
        />

        <BroadcastBar
          tabs={tabs}
          targets={broadcast}
          onToggle={toggleBroadcast}
          onClear={() => setBroadcast([])}
        />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', gap: 12 }}>
              <div style={{ fontSize: 48, opacity: 0.15 }}>⌨</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>Double-click a session to connect</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', opacity: 0.6 }}>Ctrl+Space for snippets</div>
            </div>
          )}
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{ position: 'absolute', inset: 0, visibility: tab.id === activeTabId ? 'visible' : 'hidden' }}
            >
              <TerminalTab
                tab={tab}
                session={sessions.find(s => s.id === tab.sessionId)!}
                credentials={credentials}
                isActive={tab.id === activeTabId}
                onUpdateTab={patch => updateTab(tab.id, patch)}
                onClose={() => closeTab(tab.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {showSessions && (
        <SessionForm
          session={editSession}
          credentials={credentials}
          onSave={handleSaveSession}
          onClose={() => { setShowSessions(false); setEditSession(null) }}
        />
      )}
      {showCreds && (
        <CredentialManager
          credentials={credentials}
          onRefresh={loadData}
          onClose={() => setShowCreds(false)}
        />
      )}
      {showSnippets && (
        <SnippetPicker
          snippets={snippets}
          onSend={sendSnippet}
          onClose={() => setShowSnippets(false)}
        />
      )}
    </div>
  )
}
