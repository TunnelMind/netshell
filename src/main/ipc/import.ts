import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as childProcess from 'child_process'
import { IPC } from '../../types'
import type { Session } from '../../types'
import { v4 as uuidv4 } from 'uuid'

// PuTTY registry import — Windows only
// Runs PowerShell to read HKCU:\Software\SimonTatham\PuTTY\Sessions
function importPuTTY(): Partial<Session>[] {
  if (process.platform !== 'win32') return []

  try {
    const ps = `
Get-ChildItem 'HKCU:\\Software\\SimonTatham\\PuTTY\\Sessions' | ForEach-Object {
  $s = Get-ItemProperty $_.PSPath
  [pscustomobject]@{
    Name     = [Uri]::UnescapeDataString($_.PSChildName)
    HostName = $s.HostName
    Port     = $s.PortNumber
    Protocol = $s.Protocol
    UserName = $s.UserName
  }
} | ConvertTo-Json -AsArray`
    const out = childProcess.execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, {
      timeout: 8000,
      encoding: 'utf8',
    })
    const rows: Array<{ Name: string; HostName: string; Port: number; Protocol: string; UserName: string }> = JSON.parse(out)
    return rows.map(r => {
      const proto = (r.Protocol ?? 'ssh').toLowerCase()
      const type = proto === 'telnet' ? 'telnet' : 'ssh'
      return {
        id: uuidv4(),
        name: r.Name || r.HostName || 'Unnamed',
        type,
        group: '',
        notes: r.UserName ? `PuTTY import — user: ${r.UserName}` : 'PuTTY import',
        connectionCount: 0,
        host: r.HostName || '',
        port: r.Port || (type === 'telnet' ? 23 : 22),
        authType: 'password',
        logEnabled: false,
      } as Partial<Session>
    })
  } catch (e) {
    console.error('PuTTY import error:', e)
    return []
  }
}

// SSH config import — all platforms
// Uses ssh-config npm package to parse ~/.ssh/config
function importSshConfig(filePath?: string): Partial<Session>[] {
  const configPath = filePath || path.join(os.homedir(), '.ssh', 'config')
  if (!fs.existsSync(configPath)) return []

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SSHConfig = require('ssh-config')
    const raw = fs.readFileSync(configPath, 'utf8')
    const config = SSHConfig.parse(raw)
    const sessions: Partial<Session>[] = []

    for (const block of config) {
      // Only process Host blocks, skip wildcards and non-host entries
      if (!block.param || block.param.toLowerCase() !== 'host') continue
      const hostPattern = block.value as string
      if (!hostPattern || hostPattern === '*' || hostPattern.includes('*')) continue

      const get = (key: string): string | undefined => {
        const node = (block.config ?? []).find(
          (n: { param: string; value: string }) => n.param?.toLowerCase() === key.toLowerCase()
        )
        return node?.value
      }

      const hostname = get('HostName') || hostPattern
      const port = parseInt(get('Port') ?? '22', 10)
      const identityFile = get('IdentityFile')
      const user = get('User')

      sessions.push({
        id: uuidv4(),
        name: hostPattern,
        type: 'ssh',
        group: '',
        notes: user ? `SSH config import — user: ${user}` : 'SSH config import',
        connectionCount: 0,
        host: hostname,
        port: isNaN(port) ? 22 : port,
        authType: identityFile ? 'key' : 'password',
        privateKeyPath: identityFile
          ? identityFile.replace(/^~/, os.homedir())
          : undefined,
        logEnabled: false,
      } as Partial<Session>)
    }

    return sessions
  } catch (e) {
    console.error('SSH config import error:', e)
    return []
  }
}

export function registerImportHandlers(): void {
  ipcMain.handle(IPC.IMPORT_PUTTY, async () => {
    return importPuTTY()
  })

  ipcMain.handle(IPC.IMPORT_SSH_CONFIG, async (_event, filePath?: string) => {
    return importSshConfig(filePath)
  })
}
