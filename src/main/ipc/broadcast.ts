import { ipcMain } from 'electron'
import { IPC } from '../../types'
import type { BroadcastTarget } from '../../types'

// Re-import connection maps from other modules via accessor functions
// The broadcast handler writes to active connections for SSH, Serial, Telnet
// It delegates to the per-transport write IPC handlers to avoid coupling

export function registerBroadcastHandlers(): void {
  ipcMain.handle(IPC.BROADCAST_WRITE, async (event, targets: BroadcastTarget[], data: string) => {
    // Fan out: invoke the appropriate write handler for each target
    for (const target of targets) {
      try {
        if (target.type === 'ssh') {
          await ipcMain.emit(IPC.SSH_WRITE, event, target.connId, data)
        } else if (target.type === 'serial') {
          await ipcMain.emit(IPC.SERIAL_WRITE, event, target.connId, data)
        } else if (target.type === 'telnet') {
          await ipcMain.emit(IPC.TELNET_WRITE, event, target.connId, data)
        }
      } catch (err) {
        console.warn(`Broadcast write failed for connId ${target.connId}:`, err)
      }
    }
  })
}
