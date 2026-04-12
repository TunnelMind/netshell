import { ipcMain, WebContents } from 'electron'
import { Client } from 'ssh2'
import * as fs from 'fs'
import { IPC } from '../../types'
import { load } from '../store'
import { getSecret } from './credentials'
import { notifyDataListeners } from './dataListeners'

interface ActiveConn {
  client: Client
  stream: ReturnType<Client['shell']> extends Promise<infer T> ? T : any
  sender: WebContents
}

const connections = new Map<string, ActiveConn>()

function makeConnId(sessionId: string): string {
  return `${sessionId}-${Date.now()}`
}

export function registerSshHandlers(): void {
  ipcMain.handle(IPC.SSH_CONNECT, async (event, params: {
    sessionId: string
    host: string
    port: number
    credentialId: string
    authType: 'password' | 'key'
    privateKeyPath?: string
    rows: number
    cols: number
  }) => {
    const { sessionId, host, port, credentialId, authType, privateKeyPath, rows, cols } = params
    const connId = makeConnId(sessionId)
    const sender = event.sender

    // Resolve credentials — stays in main process
    const data = load()
    const credMeta = data.credentials.find(c => c.id === credentialId)
    const username = credMeta?.username ?? 'admin'

    let authConfig: Record<string, unknown>
    if (authType === 'key' && privateKeyPath) {
      const privateKey = fs.readFileSync(privateKeyPath)
      const passphrase = await getSecret(credentialId, 'passphrase')
      authConfig = { privateKey, passphrase: passphrase ?? undefined }
    } else {
      const password = await getSecret(credentialId, 'password')
      authConfig = { password: password ?? '' }
    }

    return new Promise<{ connId: string }>((resolve, reject) => {
      const client = new Client()

      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', rows, cols }, (err, stream) => {
          if (err) {
            client.end()
            return reject(err)
          }

          connections.set(connId, { client, stream, sender })

          stream.on('data', (data: Buffer) => {
            const chunk = data.toString('binary')
            notifyDataListeners(connId, chunk)
            if (!sender.isDestroyed()) {
              sender.send(IPC.SSH_DATA, connId, chunk)
            }
          })

          stream.stderr.on('data', (data: Buffer) => {
            if (!sender.isDestroyed()) {
              sender.send(IPC.SSH_DATA, connId, data.toString('binary'))
            }
          })

          stream.on('close', () => {
            connections.delete(connId)
            if (!sender.isDestroyed()) {
              sender.send(IPC.SSH_CLOSED, connId)
            }
          })

          resolve({ connId })
        })
      })

      client.on('error', (err: Error) => {
        connections.delete(connId)
        if (!sender.isDestroyed()) {
          sender.send(IPC.SSH_ERROR, connId, err.message)
        }
        reject(err)
      })

      client.connect({
        host,
        port,
        username,
        ...authConfig,
        // Accept any host key for now — TODO: implement known_hosts check
        hostVerifier: () => true,
        readyTimeout: 10000,
      })
    })
  })

  ipcMain.handle(IPC.SSH_WRITE, (_event, connId: string, data: string) => {
    const conn = connections.get(connId)
    if (conn) conn.stream.write(data)
  })

  ipcMain.handle(IPC.SSH_RESIZE, (_event, connId: string, rows: number, cols: number) => {
    const conn = connections.get(connId)
    if (conn) conn.stream.setWindow(rows, cols, 0, 0)
  })

  ipcMain.handle(IPC.SSH_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      conn.stream.end()
      conn.client.end()
      connections.delete(connId)
    }
  })
}

export function cleanupAllConnections(): void {
  for (const [, conn] of connections) {
    try { conn.stream.end() } catch {}
    try { conn.client.end() } catch {}
  }
  connections.clear()
}
