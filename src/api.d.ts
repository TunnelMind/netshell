// Type declarations for window.api (exposed via preload contextBridge)
import type { Session, CredentialMeta, Snippet, AppSettings } from './types'

declare global {
  interface Window {
    api: {
      sessions: {
        getAll: () => Promise<Session[]>
        save: (session: Session) => Promise<Session>
        delete: (id: string) => Promise<void>
      }
      credentials: {
        getAll: () => Promise<CredentialMeta[]>
        save: (meta: CredentialMeta, secrets: { password?: string; apiToken?: string; privateKeyPassphrase?: string }) => Promise<CredentialMeta>
        delete: (id: string) => Promise<void>
      }
      snippets: {
        getAll: () => Promise<Snippet[]>
        save: (snippet: Snippet) => Promise<Snippet>
        delete: (id: string) => Promise<void>
      }
      settings: {
        get: () => Promise<AppSettings>
        save: (settings: Partial<AppSettings>) => Promise<void>
      }
      ssh: {
        connect: (params: {
          sessionId: string
          host: string
          port: number
          credentialId: string
          authType: 'password' | 'key'
          privateKeyPath?: string
          rows: number
          cols: number
        }) => Promise<{ connId: string }>
        write: (connId: string, data: string) => Promise<void>
        resize: (connId: string, rows: number, cols: number) => Promise<void>
        disconnect: (connId: string) => Promise<void>
        onData: (cb: (connId: string, data: string) => void) => () => void
        onClosed: (cb: (connId: string) => void) => () => void
        onError: (cb: (connId: string, message: string) => void) => () => void
      }
    }
  }
}
