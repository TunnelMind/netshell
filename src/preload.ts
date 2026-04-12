import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './types'
import type { Session, CredentialMeta, Snippet, AppSettings, BroadcastTarget, Script, ScriptProgress, TftpTransferEntry, AuditEntry } from './types'

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
})

export {}
