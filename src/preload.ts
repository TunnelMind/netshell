import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './types'
import type { Session, CredentialMeta, Snippet, AppSettings, BroadcastTarget, Script, ScriptProgress, TftpTransferEntry, AuditEntry, ConfigTemplate, CompliancePolicy, ComplianceScanResult, RecordingMeta, RecordingFrame, TopologyNode, TopologyLink, TelemetryPoint, NormalizedInterface, NormalizedBgpPeer, NormalizedArpEntry, NormalizedDeviceInfo, JitRequest, Vendor, LicenseState } from './types'

function on(channel: string, cb: (...args: unknown[]) => void) {
  const h = (_: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...args)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

contextBridge.exposeInMainWorld('api', {
  sessions: {
    getAll: (): Promise<Session[]> => ipcRenderer.invoke(IPC.SESSIONS_GET_ALL),
    save: (s: Session): Promise<Session> => ipcRenderer.invoke(IPC.SESSIONS_SAVE, s),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SESSIONS_DELETE, id),
  },
  credentials: {
    getAll: (): Promise<CredentialMeta[]> => ipcRenderer.invoke(IPC.CREDS_GET_ALL),
    save: (meta: CredentialMeta, secrets: { password?: string; apiToken?: string; privateKeyPassphrase?: string }): Promise<CredentialMeta> =>
      ipcRenderer.invoke(IPC.CREDS_SAVE, meta, secrets),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.CREDS_DELETE, id),
  },
  snippets: {
    getAll: (): Promise<Snippet[]> => ipcRenderer.invoke(IPC.SNIPPETS_GET_ALL),
    save: (s: Snippet): Promise<Snippet> => ipcRenderer.invoke(IPC.SNIPPETS_SAVE, s),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SNIPPETS_DELETE, id),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    save: (s: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, s),
  },
  ssh: {
    connect: (p: { sessionId: string; host: string; port: number; credentialId: string; authType: 'password'|'key'; privateKeyPath?: string; rows: number; cols: number }) =>
      ipcRenderer.invoke(IPC.SSH_CONNECT, p),
    write:      (connId: string, data: string)              => ipcRenderer.invoke(IPC.SSH_WRITE, connId, data),
    resize:     (connId: string, rows: number, cols: number) => ipcRenderer.invoke(IPC.SSH_RESIZE, connId, rows, cols),
    disconnect: (connId: string)                            => ipcRenderer.invoke(IPC.SSH_DISCONNECT, connId),
    onData:   (cb: (connId: string, data: string) => void)           => on(IPC.SSH_DATA,   (c, d) => cb(c as string, d as string)),
    onClosed: (cb: (connId: string) => void)                         => on(IPC.SSH_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)            => on(IPC.SSH_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  serial: {
    list: (): Promise<{ path: string; manufacturer: string }[]> => ipcRenderer.invoke(IPC.SERIAL_LIST),
    connect: (p: { sessionId: string; path: string; baudRate: number; dataBits: 5|6|7|8; stopBits: 1|2; parity: 'none'|'even'|'odd' }) =>
      ipcRenderer.invoke(IPC.SERIAL_CONNECT, p),
    write:      (connId: string, data: string) => ipcRenderer.invoke(IPC.SERIAL_WRITE, connId, data),
    disconnect: (connId: string)               => ipcRenderer.invoke(IPC.SERIAL_DISCONNECT, connId),
    onData:   (cb: (connId: string, data: string) => void) => on(IPC.SERIAL_DATA,   (c, d) => cb(c as string, d as string)),
    onClosed: (cb: (connId: string) => void)               => on(IPC.SERIAL_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)  => on(IPC.SERIAL_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  telnet: {
    connect: (p: { sessionId: string; host: string; port: number }) =>
      ipcRenderer.invoke(IPC.TELNET_CONNECT, p),
    write:      (connId: string, data: string) => ipcRenderer.invoke(IPC.TELNET_WRITE, connId, data),
    disconnect: (connId: string)               => ipcRenderer.invoke(IPC.TELNET_DISCONNECT, connId),
    onData:   (cb: (connId: string, data: string) => void) => on(IPC.TELNET_DATA,   (c, d) => cb(c as string, d as string)),
    onClosed: (cb: (connId: string) => void)               => on(IPC.TELNET_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)  => on(IPC.TELNET_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  meraki: {
    check:        (): Promise<boolean>                                    => ipcRenderer.invoke(IPC.MERAKI_CHECK),
    exec:         (p: { execId: string; credentialId: string; command: string }) => ipcRenderer.invoke(IPC.MERAKI_EXEC, p),
    listOrgs:     (credentialId: string)                                  => ipcRenderer.invoke(IPC.MERAKI_LIST_ORGS, credentialId),
    listNetworks: (credentialId: string, orgId: string)                   => ipcRenderer.invoke(IPC.MERAKI_LIST_NETWORKS, credentialId, orgId),
    onData:  (cb: (execId: string, data: string) => void)        => on(IPC.MERAKI_DATA,  (id, d) => cb(id as string, d as string)),
    onDone:  (cb: (execId: string, code: number) => void)        => on(IPC.MERAKI_DONE,  (id, c) => cb(id as string, c as number)),
    onError: (cb: (execId: string, msg: string) => void)         => on(IPC.MERAKI_ERROR, (id, m) => cb(id as string, m as string)),
  },
  broadcast: {
    write: (targets: BroadcastTarget[], data: string): Promise<void> =>
      ipcRenderer.invoke(IPC.BROADCAST_WRITE, targets, data),
  },
  import: {
    putty: (): Promise<Partial<Session>[]> => ipcRenderer.invoke(IPC.IMPORT_PUTTY),
    sshConfig: (filePath?: string): Promise<Partial<Session>[]> => ipcRenderer.invoke(IPC.IMPORT_SSH_CONFIG, filePath),
  },
  scripts: {
    getAll: (): Promise<Script[]> => ipcRenderer.invoke(IPC.SCRIPTS_GET_ALL),
    save: (s: Script): Promise<Script> => ipcRenderer.invoke(IPC.SCRIPTS_SAVE, s),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SCRIPTS_DELETE, id),
    run: (p: { runId: string; scriptId: string; connId: string; connType: string; variables: Record<string,string> }): Promise<void> =>
      ipcRenderer.invoke(IPC.SCRIPT_RUN, p),
    cancel: (runId: string): Promise<void> => ipcRenderer.invoke(IPC.SCRIPT_CANCEL, runId),
    onProgress: (cb: (p: ScriptProgress) => void) => on(IPC.SCRIPT_PROGRESS, (p) => cb(p as ScriptProgress)),
    onDone: (cb: (runId: string, success: boolean) => void) => on(IPC.SCRIPT_DONE, (id, ok) => cb(id as string, ok as boolean)),
  },
  tftp: {
    start: (p: { bindAddr: string; rootDir: string }): Promise<void> => ipcRenderer.invoke(IPC.TFTP_START, p),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.TFTP_STOP),
    onStatus: (cb: (running: boolean) => void) => on(IPC.TFTP_STATUS, (r) => cb(r as boolean)),
    onTransfer: (cb: (entry: TftpTransferEntry) => void) => on(IPC.TFTP_TRANSFER, (e) => cb(e as TftpTransferEntry)),
  },
  audit: {
    getRecent: (limit?: number): Promise<AuditEntry[]> => ipcRenderer.invoke(IPC.AUDIT_GET_RECENT, limit),
  },
  vaultToken: {
    save: (token: string): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE_VAULT_TOKEN, token),
    test: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.SETTINGS_TEST_VAULT),
  },
  gnmi: {
    connect: (p: { sessionId: string; host: string; port: number; credentialId?: string; insecure?: boolean; paths: string[]; sampleIntervalMs?: number }): Promise<{ connId: string }> =>
      ipcRenderer.invoke(IPC.GNMI_CONNECT, p),
    get: (p: { connId: string; paths: string[] }): Promise<TelemetryPoint[]> =>
      ipcRenderer.invoke(IPC.GNMI_GET, p),
    disconnect: (connId: string): Promise<void> => ipcRenderer.invoke(IPC.GNMI_DISCONNECT, connId),
    onData:   (cb: (connId: string, point: TelemetryPoint) => void) => on(IPC.GNMI_DATA,   (c, p) => cb(c as string, p as TelemetryPoint)),
    onClosed: (cb: (connId: string) => void)                        => on(IPC.GNMI_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)           => on(IPC.GNMI_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  k8s: {
    listContexts: (): Promise<{ name: string; cluster: string; user: string; current: boolean }[]> =>
      ipcRenderer.invoke(IPC.K8S_LIST_CONTEXTS),
    listPods: (p: { context?: string; namespace?: string }): Promise<{ name: string; namespace: string; status: string; containers: string[]; ready: boolean }[]> =>
      ipcRenderer.invoke(IPC.K8S_LIST_PODS, p),
    connect: (p: { sessionId: string; context?: string; namespace: string; pod: string; container?: string; rows: number; cols: number }): Promise<{ connId: string }> =>
      ipcRenderer.invoke(IPC.K8S_CONNECT, p),
    write:      (connId: string, data: string)               => ipcRenderer.invoke(IPC.K8S_WRITE, connId, data),
    resize:     (connId: string, rows: number, cols: number) => ipcRenderer.invoke(IPC.K8S_RESIZE, connId, rows, cols),
    disconnect: (connId: string)                             => ipcRenderer.invoke(IPC.K8S_DISCONNECT, connId),
    onData:   (cb: (connId: string, data: string) => void) => on(IPC.K8S_DATA,   (c, d) => cb(c as string, d as string)),
    onClosed: (cb: (connId: string) => void)               => on(IPC.K8S_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)  => on(IPC.K8S_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  ssm: {
    listInstances: (p: { region?: string; profile?: string }): Promise<{ instanceId: string; name: string; platform: string; pingStatus: string; ipAddress: string }[]> =>
      ipcRenderer.invoke(IPC.SSM_LIST_INSTANCES, p),
    connect: (p: { sessionId: string; instanceId: string; region?: string; profile?: string; rows: number; cols: number }): Promise<{ connId: string }> =>
      ipcRenderer.invoke(IPC.SSM_CONNECT, p),
    write:      (connId: string, data: string) => ipcRenderer.invoke(IPC.SSM_WRITE, connId, data),
    disconnect: (connId: string)               => ipcRenderer.invoke(IPC.SSM_DISCONNECT, connId),
    onData:   (cb: (connId: string, data: string) => void) => on(IPC.SSM_DATA,   (c, d) => cb(c as string, d as string)),
    onClosed: (cb: (connId: string) => void)               => on(IPC.SSM_CLOSED, (c)    => cb(c as string)),
    onError:  (cb: (connId: string, msg: string) => void)  => on(IPC.SSM_ERROR,  (c, m) => cb(c as string, m as string)),
  },
  ai: {
    complete: (p: { input: string; vendor?: string; sessionType?: string }): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_COMPLETE, p),
    explain: (p: { vendor?: string; output: string; question: string }): Promise<string> =>
      ipcRenderer.invoke(IPC.AI_EXPLAIN, p),
    stream: (p: { vendor?: string; output: string; question: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.AI_STREAM, p),
    onStream: (cb: (token: string) => void) => on(IPC.AI_STREAM, (t) => cb(t as string)),
  },
  recording: {
    start:  (p: { connId: string; sessionId: string; sessionName: string }): Promise<RecordingMeta> =>
      ipcRenderer.invoke(IPC.RECORDING_START, p),
    stop:   (connId: string): Promise<RecordingMeta>     => ipcRenderer.invoke(IPC.RECORDING_STOP, connId),
    getAll: (): Promise<RecordingMeta[]>                  => ipcRenderer.invoke(IPC.RECORDING_GET_ALL),
    play:   (recordingId: string): Promise<RecordingFrame[]> => ipcRenderer.invoke(IPC.RECORDING_PLAY, recordingId),
    verify: (recordingId: string): Promise<{ verified: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.RECORDING_VERIFY, recordingId),
    delete: (recordingId: string): Promise<void>          => ipcRenderer.invoke(IPC.RECORDING_DELETE, recordingId),
  },
  gitops: {
    pull:       (repoPath?: string): Promise<{ summary: any; files: string[] }> =>
      ipcRenderer.invoke(IPC.GITOPS_PULL, repoPath),
    driftCheck: (p: { sessionId: string; sessionName: string; runningConfig: string; repoPath?: string; branch?: string }): Promise<any> =>
      ipcRenderer.invoke(IPC.GITOPS_DRIFT_CHECK, p),
    commit:     (p: { repoPath?: string; message: string; files: string[] }): Promise<{ commit: string }> =>
      ipcRenderer.invoke(IPC.GITOPS_COMMIT, p),
    onDriftResult: (cb: (result: any) => void) => on(IPC.GITOPS_DRIFT_RESULT, (r) => cb(r)),
  },
  compliance: {
    getPolicies: (): Promise<CompliancePolicy[]> => ipcRenderer.invoke(IPC.COMPLIANCE_POLICIES_GET_ALL),
    savePolicy:  (p: CompliancePolicy): Promise<CompliancePolicy> => ipcRenderer.invoke(IPC.COMPLIANCE_POLICIES_SAVE, p),
    deletePolicy: (id: string): Promise<void>    => ipcRenderer.invoke(IPC.COMPLIANCE_POLICIES_DELETE, id),
    run: (p: { runId: string; policyId: string; connId: string; connType: string; sessionId: string; sessionName: string }): Promise<ComplianceScanResult> =>
      ipcRenderer.invoke(IPC.COMPLIANCE_RUN, p),
    onProgress: (cb: (p: { runId: string; checkId: string; status: string }) => void) =>
      on(IPC.COMPLIANCE_PROGRESS, (p) => cb(p as { runId: string; checkId: string; status: string })),
    onDone: (cb: (runId: string, result: ComplianceScanResult) => void) =>
      on(IPC.COMPLIANCE_DONE, (id, r) => cb(id as string, r as ComplianceScanResult)),
  },
  templates: {
    getAll: (): Promise<ConfigTemplate[]>                             => ipcRenderer.invoke(IPC.TEMPLATES_GET_ALL),
    save:   (t: ConfigTemplate): Promise<ConfigTemplate>             => ipcRenderer.invoke(IPC.TEMPLATES_SAVE, t),
    delete: (id: string): Promise<void>                               => ipcRenderer.invoke(IPC.TEMPLATES_DELETE, id),
    render: (p: { templateId: string; variables: Record<string, string | number | boolean> }): Promise<{ rendered?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.TEMPLATES_RENDER, p),
  },
  topology: {
    get:    (): Promise<{ nodes: TopologyNode[]; links: TopologyLink[] }> => ipcRenderer.invoke(IPC.TOPOLOGY_GET),
    save:   (p: { nodes: TopologyNode[]; links: TopologyLink[] }): Promise<void> => ipcRenderer.invoke(IPC.TOPOLOGY_SAVE, p),
    lldpDiscover: (p: { connId: string; connType: string; localNodeId: string }): Promise<{ nodes: TopologyNode[]; links: TopologyLink[] }> =>
      ipcRenderer.invoke(IPC.TOPOLOGY_LLDP_DISCOVER, p),
  },
  jit: {
    request: (p: { credentialId: string; sessionName: string; requestedBy: string; reason?: string }): Promise<JitRequest> =>
      ipcRenderer.invoke(IPC.JIT_REQUEST, p),
    getPending: (): Promise<JitRequest[]> => ipcRenderer.invoke(IPC.JIT_GET_PENDING),
    onApproved: (cb: (req: JitRequest) => void) => on(IPC.JIT_APPROVED, (r) => cb(r as JitRequest)),
    onDenied:   (cb: (req: JitRequest) => void) => on(IPC.JIT_DENIED,   (r) => cb(r as JitRequest)),
  },
  normalize: {
    interfaces: (p: { connId: string; connType: string; vendor: Vendor }): Promise<NormalizedInterface[]> =>
      ipcRenderer.invoke(IPC.NORMALIZE_INTERFACES, p),
    bgp:        (p: { connId: string; connType: string; vendor: Vendor }): Promise<NormalizedBgpPeer[]> =>
      ipcRenderer.invoke(IPC.NORMALIZE_BGP, p),
    arp:        (p: { connId: string; connType: string; vendor: Vendor }): Promise<NormalizedArpEntry[]> =>
      ipcRenderer.invoke(IPC.NORMALIZE_ARP, p),
    device:     (p: { connId: string; connType: string; vendor: Vendor }): Promise<NormalizedDeviceInfo> =>
      ipcRenderer.invoke(IPC.NORMALIZE_DEVICE, p),
  },
  license: {
    status:     ():              Promise<LicenseState> => ipcRenderer.invoke(IPC.LICENSE_STATUS),
    activate:   (key: string):   Promise<LicenseState> => ipcRenderer.invoke(IPC.LICENSE_ACTIVATE, key),
    deactivate: ():              Promise<LicenseState> => ipcRenderer.invoke(IPC.LICENSE_DEACTIVATE),
    onExpired:  (cb: () => void): (() => void) => on(IPC.LICENSE_EXPIRED, cb),
  },
})

export {}
