export type SessionType = 'ssh' | 'telnet' | 'serial' | 'meraki' | 'gnmi' | 'k8s' | 'ssm'
export type AuthType = 'password' | 'key'
export type Parity = 'none' | 'even' | 'odd'
export type Theme = 'dark' | 'light' | 'solarized' | 'dracula' | 'nord'
export type Vendor = 'ios' | 'iosxe' | 'iosxr' | 'nxos' | 'junos' | 'eos' | 'generic'

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
  sshAlgorithms?: string[]    // preferred kex algorithms (post-quantum)
  // Serial
  serialPort?: string
  baudRate?: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 2
  parity?: Parity
  // Meraki
  orgId?: string
  networkId?: string
  // gNMI
  gnmiPort?: number           // default 9339
  gnmiInsecure?: boolean      // skip TLS verify
  gnmiCertPath?: string       // client cert for mTLS
  gnmiPaths?: string[]        // subscribe paths e.g. "/interfaces/interface[name=*]/state"
  // Kubernetes exec
  k8sContext?: string         // kubeconfig context
  k8sNamespace?: string
  k8sPod?: string
  k8sContainer?: string
  // AWS SSM
  ssmInstanceId?: string      // i-0abc123
  ssmRegion?: string
  ssmProfile?: string         // AWS named profile
  // Logging
  logEnabled: boolean
  logPath?: string
  // Auto-detected vendor (populated after connect)
  detectedVendor?: Vendor
}

// Stored in JSON — no secrets
export interface CredentialMeta {
  id: string
  label: string
  username?: string
  vaultPath?: string
  jitEnabled?: boolean        // JIT approval required before use
  jitApprovalUrl?: string     // override global approval webhook
  jitTtlMinutes?: number      // how long JIT grant lasts (default 60)
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
  requireApproval?: boolean   // pause and request human approval via webhook
  approvalPrompt?: string     // message sent in approval request
}

export interface Script {
  id: string
  name: string
  steps: ScriptStep[]
  schedule?: string
}

export interface ScriptProgress {
  runId: string
  stepIndex: number
  status: 'running' | 'passed' | 'failed' | 'timeout' | 'awaiting_approval'
  output?: string
  approvalId?: string
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
  // AI Assistant
  ollamaUrl?: string          // default http://localhost:11434
  ollamaModel?: string        // default llama3.2
  aiEnabled?: boolean
  // Session recording
  recordingEnabled?: boolean
  recordingDir?: string
  // GitOps
  gitRepoPath?: string        // local path to git repo with intended configs
  gitBranch?: string          // branch to compare against (default main)
  driftCheckSchedule?: string // cron expression for scheduled drift checks
  // Approvals (JIT + runbook)
  approvalWebhookUrl?: string // Slack/Teams/custom webhook
  // Post-quantum SSH
  pqSshEnabled?: boolean      // prefer ML-KEM-768/X25519 hybrid kex
}

// ─── Config templates ────────────────────────────────────────────────────────

export interface ConfigTemplate {
  id: string
  name: string
  vendor: Vendor
  description: string
  template: string            // nunjucks template text
  variables: TemplateVariable[]
  tags: string[]
}

export interface TemplateVariable {
  name: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select'
  options?: string[]          // for select type
  default?: string
  required: boolean
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export interface CompliancePolicy {
  id: string
  name: string
  vendor: Vendor | 'any'
  description: string
  checks: ComplianceCheck[]
  builtin?: boolean           // built-in CIS/STIG checks
}

export interface ComplianceCheck {
  id: string
  description: string
  command: string
  expectMatch?: string        // regex that SHOULD be present
  expectNoMatch?: string      // regex that must NOT be present
  severity: 'critical' | 'high' | 'medium' | 'low'
  remediation?: string        // suggested fix command
}

export interface ComplianceResult {
  checkId: string
  description: string
  severity: ComplianceCheck['severity']
  status: 'pass' | 'fail' | 'error' | 'skipped'
  output?: string
  remediation?: string
}

export interface ComplianceScanResult {
  policyId: string
  policyName: string
  sessionId: string
  sessionName: string
  ts: number
  results: ComplianceResult[]
  passCount: number
  failCount: number
  criticalCount: number
}

// ─── Session recording ───────────────────────────────────────────────────────

export interface RecordingMeta {
  id: string
  sessionId: string
  sessionName: string
  startTs: number
  endTs?: number
  filePath: string
  signature?: string          // Ed25519 hex signature of file content
  publicKey?: string          // hex public key used for signing
  verified?: boolean
  sizeBytes?: number
}

export type RecordingFrame =
  | { t: number; type: 'output'; data: string }
  | { t: number; type: 'input';  data: string }
  | { t: number; type: 'resize'; rows: number; cols: number }

// ─── Network topology ────────────────────────────────────────────────────────

export interface TopologyNode {
  id: string
  label: string
  host?: string
  type: 'switch' | 'router' | 'firewall' | 'server' | 'ap' | 'unknown'
  sessionId?: string          // linked NetShell session
  vendor?: Vendor
}

export interface TopologyLink {
  id: string
  source: string              // TopologyNode.id
  target: string
  label?: string              // interface names e.g. "Gi0/1 — Gi0/0"
  speed?: number              // Mbps
}

// ─── Multi-vendor normalization ──────────────────────────────────────────────

export interface NormalizedInterface {
  name: string
  status: 'up' | 'down' | 'admin-down' | 'unknown'
  description?: string
  speedMbps?: number
  mtu?: number
  ipv4?: string
  ipv6?: string
  errorIn?: number
  errorOut?: number
}

export interface NormalizedBgpPeer {
  neighborAddress: string
  asn: number
  state: string
  prefixesReceived?: number
  prefixesSent?: number
  uptimeSeconds?: number
  description?: string
}

export interface NormalizedArpEntry {
  ip: string
  mac: string
  interface: string
  age?: number
}

export interface NormalizedDeviceInfo {
  hostname?: string
  vendor: Vendor
  model?: string
  version?: string
  uptime?: string
  serialNumber?: string
}

// ─── gNMI telemetry ──────────────────────────────────────────────────────────

export interface TelemetryPoint {
  ts: number
  path: string
  value: string | number | boolean
}

export interface TelemetrySeries {
  path: string
  points: TelemetryPoint[]
}

// ─── JIT credentials ─────────────────────────────────────────────────────────

export interface JitRequest {
  requestId: string
  credentialId: string
  sessionName: string
  requestedBy: string
  reason?: string
  ts: number
  status: 'pending' | 'approved' | 'denied' | 'expired'
  expiresAt?: number
}

// ─── Licensing ───────────────────────────────────────────────────────────────

export type LicenseTier = 'trial' | 'pro' | 'team'

/** The payload that the license server signs with its Ed25519 private key. */
export interface LicenseCert {
  key: string            // user-facing license key e.g. "ABCD-1234-EFGH-5678"
  email: string
  tier: LicenseTier
  issuedAt: number       // ms timestamp
  expiresAt: number      // ms timestamp
  seats: number          // how many concurrent machine activations
  machineId?: string     // if set, cert is bound to this machine fingerprint
  graceDays?: number     // extra days after expiry before hard block (default 3)
}

/** What is persisted locally: cert + detached Ed25519 signature (hex). */
export interface StoredLicense {
  cert: LicenseCert
  sig: string            // hex Ed25519 signature over canonicalJson(cert)
  activatedAt: number
  lastCheckedAt: number
}

export type LicenseState =
  | { status: 'valid';    cert: LicenseCert; daysLeft: number }
  | { status: 'grace';    cert: LicenseCert; daysLeft: number }  // expired, within grace period
  | { status: 'expired';  cert: LicenseCert }
  | { status: 'none' }
  | { status: 'invalid';  error: string }

// ─── Store ───────────────────────────────────────────────────────────────────

export interface StoreData {
  sessions: Session[]
  credentials: CredentialMeta[]
  settings: AppSettings
  snippets: Snippet[]
  scripts: Script[]
  templates: ConfigTemplate[]
  compliancePolicies: CompliancePolicy[]
  recordings: RecordingMeta[]
  topologyNodes: TopologyNode[]
  topologyLinks: TopologyLink[]
}

// ─── UI state ────────────────────────────────────────────────────────────────

export interface OpenTab {
  id: string
  sessionId: string
  sessionName: string
  sessionType: SessionType
  connId?: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  title: string
  detectedVendor?: Vendor
}

export interface MerakiOrg    { id: string; name: string }
export interface MerakiNetwork { id: string; name: string; type: string }
export interface BroadcastTarget { tabId: string; connId: string; type: SessionType }

// ─── IPC channels ────────────────────────────────────────────────────────────

export const IPC = {
  // Sessions
  SESSIONS_GET_ALL: 'sessions:getAll',
  SESSIONS_SAVE:    'sessions:save',
  SESSIONS_DELETE:  'sessions:delete',
  // Credentials
  CREDS_GET_ALL: 'credentials:getAll',
  CREDS_SAVE:    'credentials:save',
  CREDS_DELETE:  'credentials:delete',
  // Snippets
  SNIPPETS_GET_ALL: 'snippets:getAll',
  SNIPPETS_SAVE:    'snippets:save',
  SNIPPETS_DELETE:  'snippets:delete',
  // Settings
  SETTINGS_GET:              'settings:get',
  SETTINGS_SAVE:             'settings:save',
  SETTINGS_SAVE_VAULT_TOKEN: 'settings:saveVaultToken',
  SETTINGS_TEST_VAULT:       'settings:testVault',
  // SSH
  SSH_CONNECT:    'ssh:connect',
  SSH_WRITE:      'ssh:write',
  SSH_RESIZE:     'ssh:resize',
  SSH_DISCONNECT: 'ssh:disconnect',
  SSH_DATA:       'ssh:data',
  SSH_CLOSED:     'ssh:closed',
  SSH_ERROR:      'ssh:error',
  // Serial
  SERIAL_LIST:       'serial:list',
  SERIAL_CONNECT:    'serial:connect',
  SERIAL_WRITE:      'serial:write',
  SERIAL_DISCONNECT: 'serial:disconnect',
  SERIAL_DATA:       'serial:data',
  SERIAL_CLOSED:     'serial:closed',
  SERIAL_ERROR:      'serial:error',
  // Telnet
  TELNET_CONNECT:    'telnet:connect',
  TELNET_WRITE:      'telnet:write',
  TELNET_DISCONNECT: 'telnet:disconnect',
  TELNET_DATA:       'telnet:data',
  TELNET_CLOSED:     'telnet:closed',
  TELNET_ERROR:      'telnet:error',
  // Meraki
  MERAKI_CHECK:         'meraki:check',
  MERAKI_EXEC:          'meraki:exec',
  MERAKI_DATA:          'meraki:data',
  MERAKI_DONE:          'meraki:done',
  MERAKI_ERROR:         'meraki:error',
  MERAKI_LIST_ORGS:     'meraki:listOrgs',
  MERAKI_LIST_NETWORKS: 'meraki:listNetworks',
  // gNMI
  GNMI_CONNECT:    'gnmi:connect',
  GNMI_DISCONNECT: 'gnmi:disconnect',
  GNMI_GET:        'gnmi:get',
  GNMI_DATA:       'gnmi:data',
  GNMI_ERROR:      'gnmi:error',
  GNMI_CLOSED:     'gnmi:closed',
  // Kubernetes
  K8S_LIST_CONTEXTS:  'k8s:listContexts',
  K8S_LIST_PODS:      'k8s:listPods',
  K8S_CONNECT:        'k8s:connect',
  K8S_WRITE:          'k8s:write',
  K8S_RESIZE:         'k8s:resize',
  K8S_DISCONNECT:     'k8s:disconnect',
  K8S_DATA:           'k8s:data',
  K8S_CLOSED:         'k8s:closed',
  K8S_ERROR:          'k8s:error',
  // AWS SSM
  SSM_LIST_INSTANCES: 'ssm:listInstances',
  SSM_CONNECT:        'ssm:connect',
  SSM_WRITE:          'ssm:write',
  SSM_DISCONNECT:     'ssm:disconnect',
  SSM_DATA:           'ssm:data',
  SSM_CLOSED:         'ssm:closed',
  SSM_ERROR:          'ssm:error',
  // Broadcast
  BROADCAST_WRITE: 'broadcast:write',
  // Import
  IMPORT_PUTTY:       'import:putty',
  IMPORT_SSH_CONFIG:  'import:sshConfig',
  IMPORT_TERRAFORM:   'import:terraform',
  IMPORT_ANSIBLE:     'import:ansible',
  // Scripts
  SCRIPTS_GET_ALL:  'scripts:getAll',
  SCRIPTS_SAVE:     'scripts:save',
  SCRIPTS_DELETE:   'scripts:delete',
  SCRIPT_RUN:       'script:run',
  SCRIPT_CANCEL:    'script:cancel',
  SCRIPT_PROGRESS:  'script:progress',
  SCRIPT_DONE:      'script:done',
  SCRIPT_APPROVAL:  'script:approval',   // renderer ← main (approval gate triggered)
  // TFTP
  TFTP_START:    'tftp:start',
  TFTP_STOP:     'tftp:stop',
  TFTP_STATUS:   'tftp:status',
  TFTP_TRANSFER: 'tftp:transfer',
  // Audit
  AUDIT_GET_RECENT: 'audit:getRecent',
  // AI assistant
  AI_COMPLETE:    'ai:complete',
  AI_STREAM:      'ai:stream',
  AI_EXPLAIN:     'ai:explain',
  // Session recording
  RECORDING_START:   'recording:start',
  RECORDING_STOP:    'recording:stop',
  RECORDING_GET_ALL: 'recording:getAll',
  RECORDING_PLAY:    'recording:play',
  RECORDING_VERIFY:  'recording:verify',
  RECORDING_DELETE:  'recording:delete',
  // GitOps / drift
  GITOPS_PULL:         'gitops:pull',
  GITOPS_DRIFT_CHECK:  'gitops:driftCheck',
  GITOPS_DRIFT_RESULT: 'gitops:driftResult',
  GITOPS_COMMIT:       'gitops:commit',
  // Compliance
  COMPLIANCE_POLICIES_GET_ALL: 'compliance:policiesGetAll',
  COMPLIANCE_POLICIES_SAVE:    'compliance:policiesSave',
  COMPLIANCE_POLICIES_DELETE:  'compliance:policiesDelete',
  COMPLIANCE_RUN:              'compliance:run',
  COMPLIANCE_PROGRESS:         'compliance:progress',
  COMPLIANCE_DONE:             'compliance:done',
  // Config templates
  TEMPLATES_GET_ALL: 'templates:getAll',
  TEMPLATES_SAVE:    'templates:save',
  TEMPLATES_DELETE:  'templates:delete',
  TEMPLATES_RENDER:  'templates:render',
  // Network topology
  TOPOLOGY_GET:           'topology:get',
  TOPOLOGY_SAVE:          'topology:save',
  TOPOLOGY_LLDP_DISCOVER: 'topology:lldpDiscover',
  // JIT credentials
  JIT_REQUEST:  'jit:request',
  JIT_APPROVED: 'jit:approved',
  JIT_DENIED:   'jit:denied',
  JIT_GET_PENDING: 'jit:getPending',
  // Multi-vendor normalization
  NORMALIZE_INTERFACES: 'normalize:interfaces',
  NORMALIZE_BGP:        'normalize:bgp',
  NORMALIZE_ARP:        'normalize:arp',
  NORMALIZE_DEVICE:     'normalize:device',
  // Licensing
  LICENSE_STATUS:       'license:status',
  LICENSE_ACTIVATE:     'license:activate',
  LICENSE_DEACTIVATE:   'license:deactivate',
  LICENSE_EXPIRED:      'license:expired',    // main → renderer push event
} as const
