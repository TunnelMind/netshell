import { ipcMain } from 'electron'
import { IPC } from '../../types'
import type { TftpTransferEntry } from '../../types'

// tftp has no @types package — use dynamic require with any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tftpLib: any = null

function getTftp(): any {
  if (!tftpLib) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      tftpLib = require('tftp')
    } catch {
      throw new Error('tftp package not available')
    }
  }
  return tftpLib
}

let server: any = null

export function registerTftpHandlers(): void {
  ipcMain.handle(IPC.TFTP_START, async (event, params: { bindAddr: string; rootDir: string }) => {
    if (server) {
      server.close()
      server = null
    }

    const tftp = getTftp()
    server = tftp.createServer({ host: params.bindAddr, port: 69, root: params.rootDir })

    server.on('request', (req: any) => {
      req.on('close', () => {
        const entry: TftpTransferEntry = {
          file: req.file ?? '?',
          client: req.stats?.remoteAddress ?? '?',
          size: req.stats?.size ?? 0,
          status: 'done',
          ts: Date.now(),
        }
        if (!event.sender.isDestroyed()) event.sender.send(IPC.TFTP_TRANSFER, entry)
      })
      req.on('error', (err: Error) => {
        const entry: TftpTransferEntry = {
          file: req.file ?? '?',
          client: req.stats?.remoteAddress ?? '?',
          size: 0,
          status: `error: ${err.message}`,
          ts: Date.now(),
        }
        if (!event.sender.isDestroyed()) event.sender.send(IPC.TFTP_TRANSFER, entry)
      })
    })

    server.on('error', (err: Error) => {
      console.error('TFTP server error:', err)
    })

    server.listen()

    if (!event.sender.isDestroyed()) event.sender.send(IPC.TFTP_STATUS, true)
  })

  ipcMain.handle(IPC.TFTP_STOP, (event) => {
    if (server) {
      server.close()
      server = null
    }
    if (!event.sender.isDestroyed()) event.sender.send(IPC.TFTP_STATUS, false)
  })
}

export function cleanupTftp(): void {
  if (server) {
    try { server.close() } catch {}
    server = null
  }
}
