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
  schedule?: string   // cron expression, e.g. "0 */6 * * *"
}

export interface ScriptProgress {
  runId: string
  stepIndex: number
  status: 'running' | 'passed' | 'failed' | 'timeout'
  output?: string
}

export interface TftpTransferEntry {
  file: string
  client: string
  size: number
  status: string
  ts: number
}

export interface AuditEntry {
  ts: number
  session: string
  type: 'connect' | 'disconnect' | 'command' | 'error'
  data?: string
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

export interface MerakiOrg   { id: string; name: string }
export interface MerakiNetwork { id: string; name: string; type: string }

export interface BroadcastTarget { tabId: string; connId: string; type: SessionType }

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
  // SSH
  SSH_CONNECT: 'ssh:connect',
  SSH_WRITE: 'ssh:write',
  SSH_RESIZE: 'ssh:resize',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_DATA: 'ssh:data',
  SSH_CLOSED: 'ssh:closed',
  SSH_ERROR: 'ssh:error',
  // Serial
  SERIAL_LIST: 'serial:list',
  SERIAL_CONNECT: 'serial:connect',
  SERIAL_WRITE: 'serial:write',
  SERIAL_DISCONNECT: 'serial:disconnect',
  SERIAL_DATA: 'serial:data',
  SERIAL_CLOSED: 'serial:closed',
  SERIAL_ERROR: 'serial:error',
  // Telnet
  TELNET_CONNECT: 'telnet:connect',
  TELNET_WRITE: 'telnet:write',
  TELNET_DISCONNECT: 'telnet:disconnect',
  TELNET_DATA: 'telnet:data',
  TELNET_CLOSED: 'telnet:closed',
  TELNET_ERROR: 'telnet:error',
  // Meraki
  MERAKI_CHECK: 'meraki:check',
  MERAKI_EXEC: 'meraki:exec',
  MERAKI_DATA: 'meraki:data',
  MERAKI_DONE: 'meraki:done',
  MERAKI_ERROR: 'meraki:error',
  MERAKI_LIST_ORGS: 'meraki:listOrgs',
  MERAKI_LIST_NETWORKS: 'meraki:listNetworks',
  // Broadcast
  BROADCAST_WRITE: 'broadcast:write',
  // Import
  IMPORT_PUTTY:          'import:putty',
  IMPORT_SSH_CONFIG:     'import:sshConfig',
  // Scripts
  SCRIPTS_GET_ALL:       'scripts:getAll',
  SCRIPTS_SAVE:          'scripts:save',
  SCRIPTS_DELETE:        'scripts:delete',
  SCRIPT_RUN:            'script:run',
  SCRIPT_CANCEL:         'script:cancel',
  SCRIPT_PROGRESS:       'script:progress',
  SCRIPT_DONE:           'script:done',
  // TFTP
  TFTP_START:            'tftp:start',
  TFTP_STOP:             'tftp:stop',
  TFTP_STATUS:           'tftp:status',
  TFTP_TRANSFER:         'tftp:transfer',
  // Audit
  AUDIT_GET_RECENT:      'audit:getRecent',
  // Settings vault token (keytar-backed, main-only)
  SETTINGS_SAVE_VAULT_TOKEN: 'settings:saveVaultToken',
  SETTINGS_TEST_VAULT:       'settings:testVault',
} as const
