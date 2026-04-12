export type SessionType = 'ssh' | 'telnet' | 'serial' | 'meraki'
export type AuthType = 'password' | 'key'
export type Parity = 'none' | 'even' | 'odd'
export type Theme = 'dark' | 'light' | 'solarized' | 'dracula' | 'nord'

export interface Session {
  id: string
  name: string
  type: SessionType
  group: string
  notes: string
  lastConnected?: number
  connectionCount: number
  credentialId?: string
  // SSH / Telnet
  host?: string
  port?: number
  authType?: AuthType
  privateKeyPath?: string
  // Serial
  serialPort?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 2
  parity?: Parity
  // Meraki
  orgId?: string
  networkId?: string
  // Logging
  logEnabled: boolean
  logPath?: string
}

// Stored in JSON — no secrets
export interface CredentialMeta {
  id: string
  label: string
  username?: string
  vaultPath?: string
}

export interface Snippet {
  id: string
  name: string
  command: string
  description: string
  tags: string[]
}

export interface ScriptStep {
  send: string
  expect?: string
  timeoutMs?: number
}

export interface Script {
  id: string
  name: string
  steps: ScriptStep[]
}

export interface AppSettings {
  theme: Theme
  fontFamily: string
  fontSize: number
  scrollback: number
  defaultLogDir: string
  vaultAddr?: string
  vaultAuthMethod?: 'token' | 'approle'
}

export interface StoreData {
  sessions: Session[]
  credentials: CredentialMeta[]
  settings: AppSettings
  snippets: Snippet[]
  scripts: Script[]
}

export interface OpenTab {
  id: string
  sessionId: string
  sessionName: string
  sessionType: SessionType
  connId?: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  title: string
}

// IPC channel names — single source of truth
export const IPC = {
  SESSIONS_GET_ALL: 'sessions:getAll',
  SESSIONS_SAVE: 'sessions:save',
  SESSIONS_DELETE: 'sessions:delete',
  CREDS_GET_ALL: 'credentials:getAll',
  CREDS_SAVE: 'credentials:save',
  CREDS_DELETE: 'credentials:delete',
  SNIPPETS_GET_ALL: 'snippets:getAll',
  SNIPPETS_SAVE: 'snippets:save',
  SNIPPETS_DELETE: 'snippets:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SSH_CONNECT: 'ssh:connect',
  SSH_WRITE: 'ssh:write',
  SSH_RESIZE: 'ssh:resize',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_DATA: 'ssh:data',
  SSH_CLOSED: 'ssh:closed',
  SSH_ERROR: 'ssh:error',
} as const
