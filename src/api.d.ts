import type { Session, CredentialMeta, Snippet, AppSettings, BroadcastTarget, MerakiOrg, MerakiNetwork, Script, ScriptProgress, TftpTransferEntry, AuditEntry, ConfigTemplate, CompliancePolicy, ComplianceScanResult, RecordingMeta, RecordingFrame, TopologyNode, TopologyLink, TelemetryPoint, NormalizedInterface, NormalizedBgpPeer, NormalizedArpEntry, NormalizedDeviceInfo, JitRequest, Vendor, LicenseState } from './types'

declare global {
  interface Window {
    api: {
      sessions: {
        getAll: () => Promise<Session[]>
        save: (s: Session) => Promise<Session>
        delete: (id: string) => Promise<void>
      }
      credentials: {
        getAll: () => Promise<CredentialMeta[]>
        save: (meta: CredentialMeta, secrets: { password?: string; apiToken?: string; privateKeyPassphrase?: string }) => Promise<CredentialMeta>
        delete: (id: string) => Promise<void>
      }
      snippets: {
        getAll: () => Promise<Snippet[]>
        save: (s: Snippet) => Promise<Snippet>
        delete: (id: string) => Promise<void>
      }
      settings: {
        get: () => Promise<AppSettings>
        save: (s: Partial<AppSettings>) => Promise<void>
      }
      ssh: {
        connect: (p: { sessionId: string; host: string; port: number; credentialId: string; authType: 'password'|'key'; privateKeyPath?: string; rows: number; cols: number }) => Promise<{ connId: string }>
        write:      (connId: string, data: string) => Promise<void>
        resize:     (connId: string, rows: number, cols: number) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      serial: {
        list: () => Promise<{ path: string; manufacturer: string }[]>
        connect: (p: { sessionId: string; path: string; baudRate: number; dataBits: 5|6|7|8; stopBits: 1|2; parity: 'none'|'even'|'odd' }) => Promise<{ connId: string }>
        write:      (connId: string, data: string) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      telnet: {
        connect: (p: { sessionId: string; host: string; port: number }) => Promise<{ connId: string }>
        write:      (connId: string, data: string) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      meraki: {
        check:        () => Promise<boolean>
        exec:         (p: { execId: string; credentialId: string; command: string }) => Promise<void>
        listOrgs:     (credentialId: string) => Promise<MerakiOrg[]>
        listNetworks: (credentialId: string, orgId: string) => Promise<MerakiNetwork[]>
        onData:  (cb: (execId: string, data: string) => void) => () => void
        onDone:  (cb: (execId: string, code: number) => void) => () => void
        onError: (cb: (execId: string, msg: string) => void) => () => void
      }
      broadcast: {
        write: (targets: BroadcastTarget[], data: string) => Promise<void>
      }
      import: {
        putty: () => Promise<Partial<Session>[]>
        sshConfig: (filePath?: string) => Promise<Partial<Session>[]>
      }
      scripts: {
        getAll: () => Promise<Script[]>
        save: (s: Script) => Promise<Script>
        delete: (id: string) => Promise<void>
        run: (p: { runId: string; scriptId: string; connId: string; connType: string; variables: Record<string,string> }) => Promise<void>
        cancel: (runId: string) => Promise<void>
        onProgress: (cb: (p: ScriptProgress) => void) => () => void
        onDone: (cb: (runId: string, success: boolean) => void) => () => void
      }
      tftp: {
        start: (p: { bindAddr: string; rootDir: string }) => Promise<void>
        stop: () => Promise<void>
        onStatus: (cb: (running: boolean) => void) => () => void
        onTransfer: (cb: (entry: TftpTransferEntry) => void) => () => void
      }
      audit: {
        getRecent: (limit?: number) => Promise<AuditEntry[]>
      }
      vaultToken: {
        save: (token: string) => Promise<void>
        test: () => Promise<{ ok: boolean; error?: string }>
      }
      gnmi: {
        connect: (p: { sessionId: string; host: string; port: number; credentialId?: string; insecure?: boolean; paths: string[]; sampleIntervalMs?: number }) => Promise<{ connId: string }>
        get: (p: { connId: string; paths: string[] }) => Promise<TelemetryPoint[]>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, point: TelemetryPoint) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      k8s: {
        listContexts: () => Promise<{ name: string; cluster: string; user: string; current: boolean }[]>
        listPods: (p: { context?: string; namespace?: string }) => Promise<{ name: string; namespace: string; status: string; containers: string[]; ready: boolean }[]>
        connect: (p: { sessionId: string; context?: string; namespace: string; pod: string; container?: string; rows: number; cols: number }) => Promise<{ connId: string }>
        write:      (connId: string, data: string) => Promise<void>
        resize:     (connId: string, rows: number, cols: number) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      ssm: {
        listInstances: (p: { region?: string; profile?: string }) => Promise<{ instanceId: string; name: string; platform: string; pingStatus: string; ipAddress: string }[]>
        connect: (p: { sessionId: string; instanceId: string; region?: string; profile?: string; rows: number; cols: number }) => Promise<{ connId: string }>
        write:      (connId: string, data: string) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData:   (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError:  (cb: (connId: string, msg: string) => void) => () => void
      }
      ai: {
        complete: (p: { input: string; vendor?: string; sessionType?: string }) => Promise<string>
        explain:  (p: { vendor?: string; output: string; question: string }) => Promise<string>
        stream:   (p: { vendor?: string; output: string; question: string }) => Promise<void>
        onStream: (cb: (token: string) => void) => () => void
      }
      recording: {
        start:  (p: { connId: string; sessionId: string; sessionName: string }) => Promise<RecordingMeta>
        stop:   (connId: string) => Promise<RecordingMeta>
        getAll: () => Promise<RecordingMeta[]>
        play:   (recordingId: string) => Promise<RecordingFrame[]>
        verify: (recordingId: string) => Promise<{ verified: boolean; error?: string }>
        delete: (recordingId: string) => Promise<void>
      }
      gitops: {
        pull:          (repoPath?: string) => Promise<{ summary: any; files: string[] }>
        driftCheck:    (p: { sessionId: string; sessionName: string; runningConfig: string; repoPath?: string; branch?: string }) => Promise<any>
        commit:        (p: { repoPath?: string; message: string; files: string[] }) => Promise<{ commit: string }>
        onDriftResult: (cb: (result: any) => void) => () => void
      }
      compliance: {
        getPolicies:  () => Promise<CompliancePolicy[]>
        savePolicy:   (p: CompliancePolicy) => Promise<CompliancePolicy>
        deletePolicy: (id: string) => Promise<void>
        run: (p: { runId: string; policyId: string; connId: string; connType: string; sessionId: string; sessionName: string }) => Promise<ComplianceScanResult>
        onProgress: (cb: (p: { runId: string; checkId: string; status: string }) => void) => () => void
        onDone:     (cb: (runId: string, result: ComplianceScanResult) => void) => () => void
      }
      templates: {
        getAll: () => Promise<ConfigTemplate[]>
        save:   (t: ConfigTemplate) => Promise<ConfigTemplate>
        delete: (id: string) => Promise<void>
        render: (p: { templateId: string; variables: Record<string, string | number | boolean> }) => Promise<{ rendered?: string; error?: string }>
      }
      topology: {
        get:          () => Promise<{ nodes: TopologyNode[]; links: TopologyLink[] }>
        save:         (p: { nodes: TopologyNode[]; links: TopologyLink[] }) => Promise<void>
        lldpDiscover: (p: { connId: string; connType: string; localNodeId: string }) => Promise<{ nodes: TopologyNode[]; links: TopologyLink[] }>
      }
      jit: {
        request:    (p: { credentialId: string; sessionName: string; requestedBy: string; reason?: string }) => Promise<JitRequest>
        getPending: () => Promise<JitRequest[]>
        onApproved: (cb: (req: JitRequest) => void) => () => void
        onDenied:   (cb: (req: JitRequest) => void) => () => void
      }
      normalize: {
        interfaces: (p: { connId: string; connType: string; vendor: Vendor }) => Promise<NormalizedInterface[]>
        bgp:        (p: { connId: string; connType: string; vendor: Vendor }) => Promise<NormalizedBgpPeer[]>
        arp:        (p: { connId: string; connType: string; vendor: Vendor }) => Promise<NormalizedArpEntry[]>
        device:     (p: { connId: string; connType: string; vendor: Vendor }) => Promise<NormalizedDeviceInfo>
      }
      license: {
        status:     ()             => Promise<LicenseState>
        activate:   (key: string)  => Promise<LicenseState>
        deactivate: ()             => Promise<LicenseState>
        onExpired:  (cb: () => void) => (() => void)
      }
    }
  }
}
