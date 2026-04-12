import { app, BrowserWindow, ipcMain } from 'electron'
import { registerSessionHandlers } from './main/ipc/sessions'
import { registerCredentialHandlers } from './main/ipc/credentials'
import { registerSshHandlers, cleanupAllConnections as cleanupSsh } from './main/ipc/ssh'
import { registerSerialHandlers, cleanupSerialConnections } from './main/ipc/serial'
import { registerTelnetHandlers, cleanupTelnetConnections } from './main/ipc/telnet'
import { registerMerakiHandlers } from './main/ipc/meraki'
import { registerBroadcastHandlers } from './main/ipc/broadcast'
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

// Settings handlers
ipcMain.handle(IPC.SETTINGS_GET, () => load().settings)
ipcMain.handle(IPC.SETTINGS_SAVE, (_event, settings) => {
  const data = load()
  data.settings = { ...data.settings, ...settings }
  save(data)
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
}

app.on('window-all-closed', () => {
  cleanupAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', cleanupAll)
