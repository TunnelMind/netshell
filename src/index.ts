import { app, BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { registerSessionHandlers } from './main/ipc/sessions'
import { registerCredentialHandlers, saveVaultToken, getVaultToken } from './main/ipc/credentials'
import { registerSshHandlers, cleanupAllConnections as cleanupSsh } from './main/ipc/ssh'
import { registerSerialHandlers, cleanupSerialConnections } from './main/ipc/serial'
import { registerTelnetHandlers, cleanupTelnetConnections } from './main/ipc/telnet'
import { registerMerakiHandlers } from './main/ipc/meraki'
import { registerBroadcastHandlers } from './main/ipc/broadcast'
import { registerImportHandlers } from './main/ipc/import'
import { registerScriptHandlers } from './main/ipc/scripts'
import { registerTftpHandlers, cleanupTftp } from './main/ipc/tftp'
import { load, save } from './main/store'
import { IPC } from './types'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string

if (require('electron-squirrel-startup')) app.quit()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'NetShell',
  })

  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

  // DevTools in development only
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

// Register all IPC handlers
registerSessionHandlers()
registerCredentialHandlers()
registerSshHandlers()
registerSerialHandlers()
registerTelnetHandlers()
registerMerakiHandlers()
registerBroadcastHandlers()
registerImportHandlers()
registerScriptHandlers()
registerTftpHandlers()

// Settings handlers
ipcMain.handle(IPC.SETTINGS_GET, () => load().settings)
ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
  const data = load()
  data.settings = { ...data.settings, ...settings }
  save(data)
})

// Audit log handler
ipcMain.handle(IPC.AUDIT_GET_RECENT, async (_e, limit = 500) => {
  const logPath = path.join(app.getPath('userData'), 'netshell', 'audit.jsonl')
  if (!fs.existsSync(logPath)) return []
  try {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)
    return lines.slice(-limit).map((l: string) => JSON.parse(l)).reverse()
  } catch {
    return []
  }
})

// Vault token handlers
ipcMain.handle(IPC.SETTINGS_SAVE_VAULT_TOKEN, async (_e, token: string) => {
  await saveVaultToken(token)
})
ipcMain.handle(IPC.SETTINGS_TEST_VAULT, async () => {
  try {
    const data = load()
    if (!data.settings.vaultAddr) return { ok: false, error: 'No Vault address configured' }
    const token = await getVaultToken()
    if (!token) return { ok: false, error: 'No Vault token stored' }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeVault = require('node-vault')
    const client = nodeVault({ endpoint: data.settings.vaultAddr, token })
    await client.health()
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message }
  }
})

// Snippets handlers
ipcMain.handle(IPC.SNIPPETS_GET_ALL, () => load().snippets)
ipcMain.handle(IPC.SNIPPETS_SAVE, (_event, snippet) => {
  const data = load()
  const { v4: uuidv4 } = require('uuid')
  if (!snippet.id) snippet.id = uuidv4()
  const idx = data.snippets.findIndex((s: { id: string }) => s.id === snippet.id)
  if (idx >= 0) data.snippets[idx] = snippet
  else data.snippets.push(snippet)
  save(data)
  return snippet
})
ipcMain.handle(IPC.SNIPPETS_DELETE, (_event, id: string) => {
  const data = load()
  data.snippets = data.snippets.filter((s: { id: string }) => s.id !== id)
  save(data)
})

app.on('ready', createWindow)

function cleanupAll() {
  cleanupSsh()
  cleanupSerialConnections()
  cleanupTelnetConnections()
  cleanupTftp()
}

app.on('window-all-closed', () => {
  cleanupAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', cleanupAll)
