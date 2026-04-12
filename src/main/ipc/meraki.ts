import { ipcMain, WebContents } from 'electron'
import { spawn, execFile } from 'child_process'
import * as https from 'https'
import { IPC } from '../../types'
import type { MerakiOrg, MerakiNetwork } from '../../types'
import { getSecret } from './credentials'

// ── Meraki API helper (used only in main process) ───────────────────
function merakiGet<T>(apiToken: string, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.meraki.com',
      path: `/api/v1${path}`,
      headers: {
        'X-Cisco-Meraki-API-Key': apiToken,
        'Accept': 'application/json',
        'User-Agent': 'NetShell/1.0',
      },
    }
    const req = https.get(options, (res) => {
      // Handle redirect (Meraki uses 307 redirects to regional endpoints)
      if ((res.statusCode === 307 || res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const url = new URL(res.headers.location)
        const redirectOpts = {
          ...options,
          hostname: url.hostname,
          path: url.pathname + url.search,
        }
        https.get(redirectOpts, (res2) => {
          let data = ''
          res2.on('data', (c: Buffer) => data += c.toString())
          res2.on('end', () => {
            try { resolve(JSON.parse(data)) } catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)) }
          })
        }).on('error', reject)
        return
      }
      let data = ''
      res.on('data', (c: Buffer) => data += c.toString())
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
  })
}

// ── Check if meraki-cli is installed ───────────────────────────────
export function checkMerakiCli(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('meraki-cli', ['--version'], (err) => resolve(!err))
  })
}

// ── Find the meraki-cli executable ────────────────────────────────
function getMerakiCmd(): string {
  return process.platform === 'win32' ? 'meraki-cli.exe' : 'meraki-cli'
}

// ── Active exec sessions (for cancellation) ───────────────────────
interface ActiveExec {
  sender: WebContents
  aborted: boolean
}
const activeExecs = new Map<string, ActiveExec>()

export function registerMerakiHandlers(): void {
  // Check meraki-cli installed
  ipcMain.handle(IPC.MERAKI_CHECK, async () => {
    return checkMerakiCli()
  })

  // Execute a meraki-cli command and stream output back
  ipcMain.handle(IPC.MERAKI_EXEC, async (event, params: {
    execId: string
    credentialId: string
    command: string   // e.g. "devices list --organizationId xxx"
  }) => {
    const { execId, credentialId, command } = params
    const sender = event.sender

    const apiToken = await getSecret(credentialId, 'apitoken')
    if (!apiToken) {
      sender.send(IPC.MERAKI_ERROR, execId, 'No API token found for this credential.')
      return
    }

    const args = command.trim().split(/\s+/).filter(Boolean)
    if (args.length === 0) {
      sender.send(IPC.MERAKI_DONE, execId)
      return
    }

    const execState: ActiveExec = { sender, aborted: false }
    activeExecs.set(execId, execState)

    const env = { ...process.env, MERAKI_DASHBOARD_API_KEY: apiToken }
    const proc = spawn(getMerakiCmd(), args, { env, shell: false })

    let stdout = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (!sender.isDestroyed()) {
        sender.send(IPC.MERAKI_DATA, execId, text)
      }
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      if (!sender.isDestroyed()) {
        sender.send(IPC.MERAKI_DATA, execId, `\x1b[33m${chunk.toString()}\x1b[0m`)
      }
    })

    proc.on('close', (code) => {
      activeExecs.delete(execId)
      if (!sender.isDestroyed()) {
        // Try to render as table if JSON
        const tableStr = tryRenderTable(stdout)
        if (tableStr) {
          // Replace raw output with formatted table
          sender.send(IPC.MERAKI_DATA, execId, `\x1b[2K\r${tableStr}`)
        }
        sender.send(IPC.MERAKI_DONE, execId, code ?? 0)
      }
    })

    proc.on('error', (err: Error) => {
      activeExecs.delete(execId)
      if (!sender.isDestroyed()) {
        if (err.message.includes('ENOENT')) {
          sender.send(IPC.MERAKI_ERROR, execId,
            'meraki-cli not found. Install it with: pip install meraki-cli')
        } else {
          sender.send(IPC.MERAKI_ERROR, execId, err.message)
        }
      }
    })
  })

  // Org list — uses Meraki API directly (no CLI needed)
  ipcMain.handle(IPC.MERAKI_LIST_ORGS, async (_event, credentialId: string): Promise<MerakiOrg[]> => {
    const apiToken = await getSecret(credentialId, 'apitoken')
    if (!apiToken) throw new Error('No API token for credential')
    const orgs = await merakiGet<MerakiOrg[]>(apiToken, '/organizations')
    return orgs.map(o => ({ id: o.id, name: o.name }))
  })

  // Network list for an org
  ipcMain.handle(IPC.MERAKI_LIST_NETWORKS, async (_event, credentialId: string, orgId: string): Promise<MerakiNetwork[]> => {
    const apiToken = await getSecret(credentialId, 'apitoken')
    if (!apiToken) throw new Error('No API token for credential')
    const nets = await merakiGet<MerakiNetwork[]>(apiToken, `/organizations/${orgId}/networks`)
    return nets.map(n => ({ id: n.id, name: n.name, type: n.type ?? '' }))
  })
}

// ── Table renderer ─────────────────────────────────────────────────
// If output looks like a JSON array of objects, render as ASCII table
function tryRenderTable(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null

  let parsed: unknown
  try { parsed = JSON.parse(trimmed) } catch { return null }

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  if (rows.length === 0) return null
  if (typeof rows[0] !== 'object' || rows[0] === null) return null

  // Collect all keys
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r as object))))
  if (keys.length === 0) return null

  // Build table with simple ASCII formatting
  const data = rows.map(r => {
    const row = r as Record<string, unknown>
    return keys.map(k => {
      const v = row[k]
      if (v === null || v === undefined) return ''
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    })
  })

  const widths = keys.map((k, i) =>
    Math.min(40, Math.max(k.length, ...data.map(r => r[i].length)))
  )

  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w)
  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+'
  const header = '| ' + keys.map((k, i) => pad(k, widths[i])).join(' | ') + ' |'
  const rowLines = data.map(r => '| ' + r.map((v, i) => pad(v, widths[i])).join(' | ') + ' |')

  return [sep, header, sep, ...rowLines, sep].join('\r\n') + '\r\n'
}
