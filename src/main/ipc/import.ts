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

// Terraform state import — parses terraform.tfstate JSON
function importTerraform(filePath: string): Partial<Session>[] {
  const resolved = path.resolve(filePath)
  if (!resolved.endsWith('.tfstate') && !resolved.endsWith('.json')) {
    throw new Error('Expected a .tfstate or .json file')
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf8')
    const state = JSON.parse(raw)
    const sessions: Partial<Session>[] = []

    const resources: any[] = state.resources ?? []
    for (const resource of resources) {
      // Handle aws_instance, google_compute_instance, azurerm_linux_virtual_machine, etc.
      const instances: any[] = resource.instances ?? []
      for (const inst of instances) {
        const attrs = inst.attributes ?? {}
        const ip = attrs.public_ip || attrs.private_ip || attrs.network_interface_ids?.[0] || attrs.ip_address
        const name = attrs.tags?.Name || attrs.name || `${resource.type}.${resource.name}`
        if (!ip) continue

        sessions.push({
          id: uuidv4(),
          name,
          type: 'ssh',
          group: resource.type,
          notes: `Terraform import — ${resource.type}.${resource.name}`,
          connectionCount: 0,
          host: ip,
          port: 22,
          authType: 'key',
          logEnabled: false,
        } as Partial<Session>)
      }
    }
    return sessions
  } catch (e) {
    console.error('Terraform import error:', e)
    return []
  }
}

// Ansible inventory import — parses YAML inventory files
function importAnsible(filePath: string): Partial<Session>[] {
  const resolved = path.resolve(filePath)
  if (!resolved.endsWith('.yml') && !resolved.endsWith('.yaml') && !resolved.endsWith('.json')) {
    throw new Error('Expected a .yml, .yaml, or .json inventory file')
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('js-yaml')
    const raw = fs.readFileSync(resolved, 'utf8')
    const inv = yaml.load(raw) as Record<string, any>
    if (!inv) return []

    const sessions: Partial<Session>[] = []

    function processGroup(groupName: string, group: any): void {
      if (!group || typeof group !== 'object') return

      // Process hosts in this group
      const hosts = group.hosts ?? {}
      for (const [hostname, hostvars] of Object.entries<any>(hosts ?? {})) {
        const ip = hostvars?.ansible_host || hostvars?.ansible_ip || hostname
        const port = parseInt(hostvars?.ansible_port ?? '22', 10)
        const user = hostvars?.ansible_user

        sessions.push({
          id: uuidv4(),
          name: hostname,
          type: 'ssh',
          group: groupName === 'all' ? '' : groupName,
          notes: user ? `Ansible import — user: ${user}` : 'Ansible import',
          connectionCount: 0,
          host: ip,
          port: isNaN(port) ? 22 : port,
          authType: 'key',
          logEnabled: false,
        } as Partial<Session>)
      }

      // Recurse into children
      const children = group.children ?? {}
      for (const [childName, childGroup] of Object.entries<any>(children ?? {})) {
        processGroup(childName, childGroup)
      }
    }

    // Top-level key is typically "all"
    if (inv.all) {
      processGroup('all', inv.all)
    } else {
      for (const [groupName, group] of Object.entries<any>(inv)) {
        processGroup(groupName, group)
      }
    }

    return sessions
  } catch (e) {
    console.error('Ansible import error:', e)
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

  ipcMain.handle(IPC.IMPORT_TERRAFORM, async (_event, filePath: string) => {
    return importTerraform(filePath)
  })

  ipcMain.handle(IPC.IMPORT_ANSIBLE, async (_event, filePath: string) => {
    return importAnsible(filePath)
  })
}
