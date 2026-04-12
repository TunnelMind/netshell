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
  const kt = await getKeytar()
  if (!kt) return null
  return kt.getPassword(SERVICE, `${credentialId}:${key}`)
}
