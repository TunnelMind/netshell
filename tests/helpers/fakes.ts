/**
 * CommonJS require hook so the Electron-side IPC files load under plain Node
 * for the golden tests (T101). Import this BEFORE anything under src/main/ipc.
 *
 * tsx compiles the .ts files to CommonJS (package.json has no "type"), so
 * every `import` in src becomes a require() that passes through Module._load.
 * We intercept only the app-bound modules and hand back small fakes:
 *   electron      → ipcMain.handle() records handlers in `handlers`
 *   ../store      → in-memory load()/save() over `store`
 *   ./compliance  → (from topology.ts only) runCommandGetOutput() answers from
 *                   `commandOutput`; normalize.ts still gets the real module
 *   uuid          → a counter, so topology ids are stable (INVENTORY P1)
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module')

type Handler = (event: unknown, ...args: unknown[]) => unknown

export const handlers = new Map<string, Handler>()
export const store: { data: Record<string, unknown> } = { data: {} }
export const commandOutput: Record<string, string> = {}

let uuidCount = 0
export function resetUuid(): void { uuidCount = 0 }

const fakes: Record<string, unknown> = {
  electron: { ipcMain: { handle: (ch: string, fn: Handler) => handlers.set(ch, fn) } },
  uuid: { v4: () => `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, '0')}` },
  '../store': { load: () => store.data, save: (d: Record<string, unknown>) => { store.data = d } },
}
const fakeCompliance = {
  runCommandGetOutput: async (_connId: string, _connType: string, command: string) => commandOutput[command] ?? '',
}

const realLoad = Module._load
Module._load = function (request: string, parent: { filename?: string } | undefined, isMain: boolean) {
  if (request in fakes) return fakes[request]
  if (request === './compliance' && parent?.filename?.endsWith('topology.ts')) return fakeCompliance
  return realLoad.call(this, request, parent, isMain)
}
