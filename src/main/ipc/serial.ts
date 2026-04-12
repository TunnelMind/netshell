import { ipcMain, WebContents } from 'electron'
import { SerialPort } from 'serialport'
import { IPC } from '../../types'

interface ActiveSerial {
  port: SerialPort
  sender: WebContents
}

const connections = new Map<string, ActiveSerial>()

function makeConnId(sessionId: string): string {
  return `serial-${sessionId}-${Date.now()}`
}

export function registerSerialHandlers(): void {
  // List available ports
  ipcMain.handle(IPC.SERIAL_LIST, async () => {
    const ports = await SerialPort.list()
    return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer ?? '' }))
  })

  ipcMain.handle(IPC.SERIAL_CONNECT, async (event, params: {
    sessionId: string
    path: string
    baudRate: number
    dataBits: 5 | 6 | 7 | 8
    stopBits: 1 | 2
    parity: 'none' | 'even' | 'odd'
  }) => {
    const { sessionId, path, baudRate, dataBits, stopBits, parity } = params
    const connId = makeConnId(sessionId)
    const sender = event.sender

    return new Promise<{ connId: string }>((resolve, reject) => {
      const port = new SerialPort({
        path,
        baudRate,
        dataBits,
        stopBits,
        parity,
        autoOpen: false,
      })

      port.open((err) => {
        if (err) return reject(err)

        connections.set(connId, { port, sender })

        port.on('data', (data: Buffer) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC.SERIAL_DATA, connId, data.toString('binary'))
          }
        })

        port.on('close', () => {
          connections.delete(connId)
          if (!sender.isDestroyed()) {
            sender.send(IPC.SERIAL_CLOSED, connId)
          }
        })

        port.on('error', (err: Error) => {
          if (!sender.isDestroyed()) {
            sender.send(IPC.SERIAL_ERROR, connId, err.message)
          }
        })

        resolve({ connId })
      })
    })
  })

  ipcMain.handle(IPC.SERIAL_WRITE, (_event, connId: string, data: string) => {
    const conn = connections.get(connId)
    if (conn) conn.port.write(Buffer.from(data, 'binary'))
  })

  ipcMain.handle(IPC.SERIAL_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      conn.port.close()
      connections.delete(connId)
    }
  })
}

export function cleanupSerialConnections(): void {
  for (const [, conn] of connections) {
    try { conn.port.close() } catch {}
  }
  connections.clear()
}
