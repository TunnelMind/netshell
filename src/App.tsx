import React, { useState, useEffect, useCallback } from 'react'
import SessionSidebar from './components/SessionSidebar'
import TabBar from './components/TabBar'
import TerminalTab from './components/TerminalTab'
import SessionForm from './components/SessionForm'
import CredentialManager from './components/CredentialManager'
import type { Session, CredentialMeta, OpenTab } from './types'

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [credentials, setCredentials] = useState<CredentialMeta[]>([])
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [showCredManager, setShowCredManager] = useState(false)

  const loadData = useCallback(async () => {
    const [s, c] = await Promise.all([
      window.api.sessions.getAll(),
      window.api.credentials.getAll(),
    ])
    setSessions(s)
    setCredentials(c)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const openSession = useCallback((session: Session) => {
    // If already open, just activate
    const existing = tabs.find(t => t.sessionId === session.id && t.status !== 'disconnected')
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const tabId = `tab-${Date.now()}`
    const tab: OpenTab = {
      id: tabId,
      sessionId: session.id,
      sessionName: session.name,
      sessionType: session.type,
      status: 'connecting',
      title: session.name,
    }
    setTabs(prev => [...prev, tab])
    setActiveTabId(tabId)
  }, [tabs])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId))
    setActiveTabId(prev => {
      if (prev !== tabId) return prev
      const remaining = tabs.filter(t => t.id !== tabId)
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null
    })
  }, [tabs])

  const updateTab = useCallback((tabId: string, patch: Partial<OpenTab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...patch } : t))
  }, [])

  const handleSaveSession = async (session: Session) => {
    const saved = await window.api.sessions.save(session)
    setSessions(prev => {
      const idx = prev.findIndex(s => s.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [...prev, saved]
    })
    setShowSessionForm(false)
    setEditingSession(null)
  }

  const handleDeleteSession = async (id: string) => {
    await window.api.sessions.delete(id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setTabs(prev => prev.filter(t => t.sessionId !== id))
  }

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <SessionSidebar
        sessions={sessions}
        onOpen={openSession}
        onNew={() => { setEditingSession(null); setShowSessionForm(true) }}
        onEdit={s => { setEditingSession(s); setShowSessionForm(true) }}
        onDelete={handleDeleteSession}
        onManageCreds={() => setShowCredManager(true)}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={closeTab}
        />

        {/* Terminal panes — all mounted, only active one visible */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-dim)', gap: 12,
            }}>
              <div style={{ fontSize: 48, opacity: 0.15 }}>⌨</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                Double-click a session to connect
              </div>
            </div>
          )}
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                position: 'absolute', inset: 0,
                visibility: tab.id === activeTabId ? 'visible' : 'hidden',
              }}
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

      {/* Modals */}
      {showSessionForm && (
        <SessionForm
          session={editingSession}
          credentials={credentials}
          onSave={handleSaveSession}
          onClose={() => { setShowSessionForm(false); setEditingSession(null) }}
        />
      )}
      {showCredManager && (
        <CredentialManager
          credentials={credentials}
          onRefresh={loadData}
          onClose={() => setShowCredManager(false)}
        />
      )}
    </div>
  )
}
