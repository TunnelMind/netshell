import { ipcMain, WebContents } from 'electron'
import * as net from 'net'
import { IPC } from '../../types'

// Telnet control bytes
const IAC  = 0xFF
const DONT = 0xFE
const DO   = 0xFD
const WONT = 0xFC
const WILL = 0xFB
const SB   = 0xFA  // subnegotiation begin
const SE   = 0xF0  // subnegotiation end

interface ActiveTelnet {
  socket: net.Socket
  sender: WebContents
}

const connections = new Map<string, ActiveTelnet>()

function makeConnId(sessionId: string): string {
  return `telnet-${sessionId}-${Date.now()}`
}

// Handle incoming telnet data: strip IAC sequences and auto-respond to option negotiations
function processTelnet(data: Buffer, socket: net.Socket): Buffer {
  const output: number[] = []
  let i = 0

  while (i < data.length) {
    if (data[i] === IAC) {
      const cmd = data[i + 1]
      if (cmd === WILL || cmd === DO) {
        // Respond DONT to WILL, WONT to DO — refuse all options
        const response = cmd === WILL ? DONT : WONT
        socket.write(Buffer.from([IAC, response, data[i + 2]]))
        i += 3
      } else if (cmd === DONT || cmd === WONT) {
        i += 3 // consume, no response needed
      } else if (cmd === SB) {
        // Skip subnegotiation block until IAC SE
        while (i < data.length && !(data[i] === IAC && data[i + 1] === SE)) i++
        i += 2
      } else if (cmd === IAC) {
        output.push(IAC) // escaped IAC = literal 0xFF
        i += 2
      } else {
        i += 2 // unknown command, skip
      }
    } else {
      output.push(data[i++])
    }
  }

  return Buffer.from(output)
}

export function registerTelnetHandlers(): void {
  ipcMain.handle(IPC.TELNET_CONNECT, async (event, params: {
    sessionId: string
    host: string
    port: number
  }) => {
    const { sessionId, host, port } = params
    const connId = makeConnId(sessionId)
    const sender = event.sender

    return new Promise<{ connId: string }>((resolve, reject) => {
      const socket = net.createConnection({ host, port })

      socket.once('connect', () => {
        connections.set(connId, { socket, sender })
        resolve({ connId })
      })

      socket.on('data', (raw: Buffer) => {
        const clean = processTelnet(raw, socket)
        if (clean.length > 0 && !sender.isDestroyed()) {
          sender.send(IPC.TELNET_DATA, connId, clean.toString('binary'))
        }
      })

      socket.on('close', () => {
        connections.delete(connId)
        if (!sender.isDestroyed()) sender.send(IPC.TELNET_CLOSED, connId)
      })

      socket.on('error', (err: Error) => {
        connections.delete(connId)
        if (!sender.isDestroyed()) sender.send(IPC.TELNET_ERROR, connId, err.message)
        reject(err)
      })

      socket.setTimeout(10000, () => {
        socket.destroy()
        reject(new Error('Connection timed out'))
      })
    })
  })

  ipcMain.handle(IPC.TELNET_WRITE, (_event, connId: string, data: string) => {
    const conn = connections.get(connId)
    if (conn) conn.socket.write(Buffer.from(data, 'binary'))
  })

  ipcMain.handle(IPC.TELNET_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      conn.socket.destroy()
      connections.delete(connId)
    }
  })
}

export function cleanupTelnetConnections(): void {
  for (const [, conn] of connections) {
    try { conn.socket.destroy() } catch {}
  }
  connections.clear()
}
