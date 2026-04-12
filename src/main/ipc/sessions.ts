import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { load, save } from '../store'
import { IPC } from '../../types'
import type { Session } from '../../types'

export function deriveGroup(session: Partial<Session>): string {
  if (session.type === 'meraki') return 'Meraki'
  if (session.type === 'serial') return 'Console'
  const host = session.host ?? ''
  // IP address: 192.168.1.10 → "192.168.1.x"
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.')
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`
  }
  // FQDN: sw.corp.example.com → "example.com"
  const labels = host.split('.')
  if (labels.length >= 2) {
    return labels.slice(-2).join('.')
  }
  // Short hyphenated: sw-nyc-01 → "sw-nyc"
  const hyphen = host.lastIndexOf('-')
  if (hyphen > 0) return host.slice(0, hyphen)
  return host || 'Default'
}

export function registerSessionHandlers(): void {
  ipcMain.handle(IPC.SESSIONS_GET_ALL, () => {
    return load().sessions
  })

  ipcMain.handle(IPC.SESSIONS_SAVE, (_event, session: Session) => {
    const data = load()
    if (!session.id) session.id = uuidv4()
    if (!session.group) session.group = deriveGroup(session)
    const idx = data.sessions.findIndex(s => s.id === session.id)
    if (idx >= 0) {
      data.sessions[idx] = session
    } else {
      data.sessions.push(session)
    }
    save(data)
    return session
  })

  ipcMain.handle(IPC.SESSIONS_DELETE, (_event, id: string) => {
    const data = load()
    data.sessions = data.sessions.filter(s => s.id !== id)
    save(data)
  })
}
