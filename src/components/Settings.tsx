import React, { useState, useEffect } from 'react'
import type { AppSettings, Theme } from '../types'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark',       label: 'Dark (default)' },
  { value: 'light',      label: 'Light' },
  { value: 'solarized',  label: 'Solarized Dark' },
  { value: 'dracula',    label: 'Dracula' },
  { value: 'nord',       label: 'Nord' },
]

const THEME_VARS: Record<Theme, Record<string, string>> = {
  dark: {
    '--bg': '#0d1117', '--bg2': '#161b22', '--bg3': '#1c2128',
    '--border': '#30363d', '--text': '#c9d1d9', '--text-dim': '#8b949e',
    '--text-bright': '#f0f6fc', '--accent': '#388bfd', '--accent-dim': '#1f3460',
  },
  light: {
    '--bg': '#ffffff', '--bg2': '#f6f8fa', '--bg3': '#eaeef2',
    '--border': '#d0d7de', '--text': '#1f2328', '--text-dim': '#636c76',
    '--text-bright': '#0d1117', '--accent': '#0969da', '--accent-dim': '#ddf4ff',
  },
  solarized: {
    '--bg': '#002b36', '--bg2': '#073642', '--bg3': '#0a4555',
    '--border': '#1d5766', '--text': '#839496', '--text-dim': '#657b83',
    '--text-bright': '#fdf6e3', '--accent': '#268bd2', '--accent-dim': '#0a2d45',
  },
  dracula: {
    '--bg': '#282a36', '--bg2': '#1e1f29', '--bg3': '#44475a',
    '--border': '#6272a4', '--text': '#f8f8f2', '--text-dim': '#6272a4',
    '--text-bright': '#ffffff', '--accent': '#bd93f9', '--accent-dim': '#3a2d5e',
  },
  nord: {
    '--bg': '#2e3440', '--bg2': '#3b4252', '--bg3': '#434c5e',
    '--border': '#4c566a', '--text': '#d8dee9', '--text-dim': '#7b88a1',
    '--text-bright': '#eceff4', '--accent': '#81a1c1', '--accent-dim': '#2b4055',
  },
}

function applyTheme(theme: Theme): void {
  const vars = THEME_VARS[theme] ?? THEME_VARS.dark
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }
}

export default function Settings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    scrollback: 10000,
    defaultLogDir: '',
  })
  const [vaultToken, setVaultToken] = useState('')
  const [vaultTestResult, setVaultTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.get().then(s => setSettings(s)).catch(() => {})
  }, [])

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setSettings(prev => {
      const next = { ...prev, [k]: v }
      if (k === 'theme') applyTheme(v as Theme)
      return next
    })

  const handleSave = async () => {
    await window.api.settings.save(settings)
    if (vaultToken) {
      await window.api.vaultToken.save(vaultToken)
      setVaultToken('')
    }
    applyTheme(settings.theme)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testVault = async () => {
    setVaultTestResult(null)
    if (vaultToken) await window.api.vaultToken.save(vaultToken)
    const result = await window.api.vaultToken.test()
    setVaultTestResult(result)
  }

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, marginTop: 4 }}>
      {text}
    </div>
  )

  const row = (label: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ width: 130, flexShrink: 0, fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 24, width: 500, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 20 }}>Settings</div>

        {/* Appearance */}
        {sectionLabel('Appearance')}

        {row('Theme', (
          <select value={settings.theme} onChange={e => set('theme', e.target.value as Theme)}>
            {THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        ))}

        {row('Font Family', (
          <input
            value={settings.fontFamily}
            onChange={e => set('fontFamily', e.target.value)}
            placeholder="'Cascadia Code', monospace"
          />
        ))}

        {row('Font Size', (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range" min={9} max={24} value={settings.fontSize}
              onChange={e => set('fontSize', parseInt(e.target.value, 10))}
              style={{ flex: 1, padding: 0, background: 'transparent', border: 'none' }}
            />
            <span style={{ width: 32, fontSize: 12, color: 'var(--text-dim)', textAlign: 'right' }}>{settings.fontSize}px</span>
          </div>
        ))}

        {row('Scrollback', (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number" min={1000} max={100000} step={1000}
              value={settings.scrollback}
              onChange={e => set('scrollback', parseInt(e.target.value, 10))}
            />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>lines</span>
          </div>
        ))}

        {/* Logging */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('Logging')}

        {row('Log Directory', (
          <input
            value={settings.defaultLogDir ?? ''}
            onChange={e => set('defaultLogDir', e.target.value)}
            placeholder="Leave blank for default (AppData/netshell/logs)"
          />
        ))}

        {/* HashiCorp Vault */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('HashiCorp Vault')}

        {row('Vault Address', (
          <input
            value={settings.vaultAddr ?? ''}
            onChange={e => set('vaultAddr', e.target.value)}
            placeholder="https://vault.example.com"
          />
        ))}

        {row('Auth Method', (
          <select
            value={settings.vaultAuthMethod ?? 'token'}
            onChange={e => set('vaultAuthMethod', e.target.value as 'token' | 'approle')}
          >
            <option value="token">Token</option>
            <option value="approle">AppRole</option>
          </select>
        ))}

        {row('Vault Token', (
          <input
            type="password"
            value={vaultToken}
            onChange={e => setVaultToken(e.target.value)}
            placeholder="Stored securely in OS keychain — leave blank to keep existing"
          />
        ))}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, paddingLeft: 142 }}>
          <button onClick={testVault} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
            borderRadius: 4, padding: '4px 12px', fontSize: 11,
          }}>Test Connection</button>
          {vaultTestResult && (
            <span style={{ fontSize: 11, color: vaultTestResult.ok ? 'var(--green)' : 'var(--red)' }}>
              {vaultTestResult.ok ? '✓ Connected' : `✗ ${vaultTestResult.error}`}
            </span>
          )}
        </div>

        {/* AI Assistant */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('AI Assistant (Local Ollama)')}

        {row('Ollama URL', (
          <input
            value={settings.ollamaUrl ?? 'http://localhost:11434'}
            onChange={e => set('ollamaUrl', e.target.value)}
            placeholder="http://localhost:11434"
          />
        ))}

        {row('Model', (
          <input
            value={settings.ollamaModel ?? 'llama3.2'}
            onChange={e => set('ollamaModel', e.target.value)}
            placeholder="llama3.2"
          />
        ))}

        {row('Enable AI', (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
            <input type="checkbox" checked={!!settings.aiEnabled} onChange={e => set('aiEnabled', e.target.checked)} style={{ width: 'auto' }} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Enable AI command assistant</span>
          </label>
        ))}

        {/* Session Recording */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('Session Recording')}

        {row('Enable Recording', (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
            <input type="checkbox" checked={!!settings.recordingEnabled} onChange={e => set('recordingEnabled', e.target.checked)} style={{ width: 'auto' }} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Auto-record sessions (Ed25519 signed)</span>
          </label>
        ))}

        {row('Recording Dir', (
          <input
            value={settings.recordingDir ?? ''}
            onChange={e => set('recordingDir', e.target.value)}
            placeholder="Leave blank for default (AppData/netshell/recordings)"
          />
        ))}

        {/* Post-Quantum SSH */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('Post-Quantum SSH')}

        {row('PQ Kex', (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'auto' }}>
            <input type="checkbox" checked={!!settings.pqSshEnabled} onChange={e => set('pqSshEnabled', e.target.checked)} style={{ width: 'auto' }} />
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Prefer ML-KEM-768/X25519 hybrid kex (server must support)</span>
          </label>
        ))}

        {/* Approvals */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('Approval Webhooks (JIT / Runbook)')}

        {row('Webhook URL', (
          <input
            value={settings.approvalWebhookUrl ?? ''}
            onChange={e => set('approvalWebhookUrl', e.target.value)}
            placeholder="https://hooks.slack.com/services/... or Teams URL"
          />
        ))}

        {/* GitOps */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        {sectionLabel('GitOps / Drift Detection')}

        {row('Git Repo Path', (
          <input
            value={settings.gitRepoPath ?? ''}
            onChange={e => set('gitRepoPath', e.target.value)}
            placeholder="/home/user/network-configs"
          />
        ))}

        {row('Branch', (
          <input
            value={settings.gitBranch ?? 'main'}
            onChange={e => set('gitBranch', e.target.value)}
            placeholder="main"
          />
        ))}

        {/* Footer */}
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
            borderRadius: 4, padding: '6px 16px',
          }}>Close</button>
          <button onClick={handleSave} style={{
            background: saved ? 'var(--green-dim)' : 'var(--accent-dim)',
            border: `1px solid ${saved ? 'var(--green)' : 'var(--accent)'}`,
            color: saved ? 'var(--green)' : 'var(--accent)',
            borderRadius: 4, padding: '6px 20px', fontWeight: 600,
          }}>
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
