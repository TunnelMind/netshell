import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './types'
import type { Session, CredentialMeta, Snippet, AppSettings } from './types'

// All secret handling stays in main process.
// Renderer only sees IDs and labels for credentials.
contextBridge.exposeInMainWorld('api', {
  sessions: {
    getAll: (): Promise<Session[]> => ipcRenderer.invoke(IPC.SESSIONS_GET_ALL),
    save: (session: Session): Promise<Session> => ipcRenderer.invoke(IPC.SESSIONS_SAVE, session),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SESSIONS_DELETE, id),
  },
  credentials: {
    getAll: (): Promise<CredentialMeta[]> => ipcRenderer.invoke(IPC.CREDS_GET_ALL),
    save: (meta: CredentialMeta, secrets: { password?: string, apiToken?: string, privateKeyPassphrase?: string }): Promise<CredentialMeta> =>
      ipcRenderer.invoke(IPC.CREDS_SAVE, meta, secrets),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.CREDS_DELETE, id),
  },
  snippets: {
    getAll: (): Promise<Snippet[]> => ipcRenderer.invoke(IPC.SNIPPETS_GET_ALL),
    save: (snippet: Snippet): Promise<Snippet> => ipcRenderer.invoke(IPC.SNIPPETS_SAVE, snippet),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SNIPPETS_DELETE, id),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    save: (settings: Partial<AppSettings>): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
  },
  ssh: {
    connect: (params: {
      sessionId: string, host: string, port: number, credentialId: string,
      authType: 'password' | 'key', privateKeyPath?: string, rows: number, cols: number,
    }): Promise<{ connId: string }> => ipcRenderer.invoke(IPC.SSH_CONNECT, params),
    write: (connId: string, data: string): Promise<void> => ipcRenderer.invoke(IPC.SSH_WRITE, connId, data),
    resize: (connId: string, rows: number, cols: number): Promise<void> => ipcRenderer.invoke(IPC.SSH_RESIZE, connId, rows, cols),
    disconnect: (connId: string): Promise<void> => ipcRenderer.invoke(IPC.SSH_DISCONNECT, connId),
    onData: (cb: (connId: string, data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, connId: string, data: string) => cb(connId, data)
      ipcRenderer.on(IPC.SSH_DATA, handler)
      return () => ipcRenderer.removeListener(IPC.SSH_DATA, handler)
    },
    onClosed: (cb: (connId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, connId: string) => cb(connId)
      ipcRenderer.on(IPC.SSH_CLOSED, handler)
      return () => ipcRenderer.removeListener(IPC.SSH_CLOSED, handler)
    },
    onError: (cb: (connId: string, message: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, connId: string, message: string) => cb(connId, message)
      ipcRenderer.on(IPC.SSH_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.SSH_ERROR, handler)
    },
  },
})

// Expose type declaration for renderer TypeScript
export {}
