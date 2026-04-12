import type { Session, CredentialMeta, Snippet, AppSettings, BroadcastTarget, MerakiOrg, MerakiNetwork, Script, ScriptProgress, TftpTransferEntry, AuditEntry } from './types'

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
    }
  }
}
