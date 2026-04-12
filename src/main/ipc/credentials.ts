import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { load, save } from '../store'
import { IPC } from '../../types'
import type { CredentialMeta } from '../../types'

// Secrets are ONLY stored in the OS keychain via keytar.
// The renderer never receives raw passwords or tokens.

let keytar: typeof import('keytar') | null = null

async function getKeytar() {
  if (!keytar) {
    try {
      keytar = await import('keytar')
    } catch {
      console.warn('keytar not available — credentials will not be stored securely')
    }
  }
  return keytar
}

const SERVICE = 'netshell'

export function registerCredentialHandlers(): void {
  ipcMain.handle(IPC.CREDS_GET_ALL, () => {
    return load().credentials
  })

  ipcMain.handle(IPC.CREDS_SAVE, async (_event, meta: CredentialMeta, secrets: { password?: string, apiToken?: string, privateKeyPassphrase?: string }) => {
    const data = load()
    if (!meta.id) meta.id = uuidv4()

    const kt = await getKeytar()
    if (kt) {
      if (secrets.password !== undefined) {
        await kt.setPassword(SERVICE, `${meta.id}:password`, secrets.password)
      }
      if (secrets.apiToken !== undefined) {
        await kt.setPassword(SERVICE, `${meta.id}:apitoken`, secrets.apiToken)
      }
      if (secrets.privateKeyPassphrase !== undefined) {
        await kt.setPassword(SERVICE, `${meta.id}:passphrase`, secrets.privateKeyPassphrase)
      }
    }

    const idx = data.credentials.findIndex(c => c.id === meta.id)
    if (idx >= 0) {
      data.credentials[idx] = meta
    } else {
      data.credentials.push(meta)
    }
    save(data)
    return meta
  })

  ipcMain.handle(IPC.CREDS_DELETE, async (_event, id: string) => {
    const data = load()
    const kt = await getKeytar()
    if (kt) {
      await kt.deletePassword(SERVICE, `${id}:password`)
      await kt.deletePassword(SERVICE, `${id}:apitoken`)
      await kt.deletePassword(SERVICE, `${id}:passphrase`)
    }
    data.credentials = data.credentials.filter(c => c.id !== id)
    save(data)
  })
}

// Exported for use by ssh.ts / meraki.ts — never sent to renderer
export async function getSecret(credentialId: string, key: 'password' | 'apitoken' | 'passphrase'): Promise<string | null> {
  const data = load()
  const meta = data.credentials.find(c => c.id === credentialId)

  // Vault path integration: if vaultPath set, fetch from HashiCorp Vault at connect time
  if (meta?.vaultPath && data.settings.vaultAddr) {
    try {
      const kt = await getKeytar()
      const vaultToken = kt ? await kt.getPassword(SERVICE, 'vault-token') : null
      if (vaultToken) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeVault = require('node-vault')
        const client = nodeVault({ endpoint: data.settings.vaultAddr, token: vaultToken })
        const result = await client.read(meta.vaultPath)
        // KV v2: result.data.data, KV v1: result.data
        const secretData = result?.data?.data ?? result?.data ?? {}
        // Map our key names to common vault field names
        const fieldMap: Record<string, string[]> = {
          password:   ['password', 'pass', 'secret'],
          apitoken:   ['apiToken', 'api_token', 'token'],
          passphrase: ['passphrase', 'key_passphrase'],
        }
        for (const field of (fieldMap[key] ?? [key])) {
          if (secretData[field]) return secretData[field]
        }
      }
    } catch (e) {
      console.warn(`Vault fetch failed for ${credentialId}:${key}:`, e)
    }
  }

  const kt = await getKeytar()
  if (!kt) return null
  return kt.getPassword(SERVICE, `${credentialId}:${key}`)
}

// Store and retrieve vault token (main-process only, stays in keytar)
export async function saveVaultToken(token: string): Promise<void> {
  const kt = await getKeytar()
  if (kt) await kt.setPassword(SERVICE, 'vault-token', token)
}

export async function getVaultToken(): Promise<string | null> {
  const kt = await getKeytar()
  if (!kt) return null
  return kt.getPassword(SERVICE, 'vault-token')
}
