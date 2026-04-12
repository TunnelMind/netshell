import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as cron from 'node-cron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { Script } from '../../types'
import { load, save } from '../store'
import { addDataListener } from './dataListeners'

// ─── Cancel flags ────────────────────────────────────────────────────────────
const cancelFlags = new Map<string, boolean>()

// ─── Scheduled jobs ──────────────────────────────────────────────────────────
const cronJobs = new Map<string, cron.ScheduledTask>()

function scheduledLogPath(scriptName: string): string {
  const dir = path.join(app.getPath('userData'), 'netshell', 'scheduled-logs')
  fs.mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(dir, `${scriptName.replace(/[^a-z0-9]/gi, '_')}_${ts}.log`)
}

function rescheduleAll(): void {
  // Cancel existing jobs
  for (const [id, job] of cronJobs) {
    job.stop()
    cronJobs.delete(id)
  }

  const data = load()
  for (const script of data.scripts) {
    if (!script.schedule) continue
    if (!cron.validate(script.schedule)) continue

    const task = cron.schedule(script.schedule, () => {
      const logPath = scheduledLogPath(script.name)
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] Scheduled run of "${script.name}" — no active session targeted\n`)
    })
    cronJobs.set(script.id, task)
  }
}

// ─── Expect runner ────────────────────────────────────────────────────────────
function resolveVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}

async function writeToConnection(connId: string, connType: string, data: string): Promise<void> {
  const channel = connType === 'ssh'    ? IPC.SSH_WRITE
                : connType === 'serial' ? IPC.SERIAL_WRITE
                : IPC.TELNET_WRITE
  // Dispatch through ipcMain — same pattern as broadcast.ts
  ipcMain.emit(channel, { sender: { isDestroyed: () => false } } as any, connId, data)
}

function waitForExpect(connId: string, pattern: RegExp, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('timeout'))
    }, timeoutMs)

    const unsubscribe = addDataListener(connId, (chunk) => {
      buffer += chunk
      if (pattern.test(buffer)) {
        clearTimeout(timer)
        unsubscribe()
        resolve(buffer)
      }
    })
  })
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
export function registerScriptHandlers(): void {
  // CRUD
  ipcMain.handle(IPC.SCRIPTS_GET_ALL, () => load().scripts)

  ipcMain.handle(IPC.SCRIPTS_SAVE, (_event, script: Script) => {
    const data = load()
    if (!script.id) script.id = uuidv4()
    const idx = data.scripts.findIndex(s => s.id === script.id)
    if (idx >= 0) data.scripts[idx] = script
    else data.scripts.push(script)
    save(data)
    rescheduleAll()
    return script
  })

  ipcMain.handle(IPC.SCRIPTS_DELETE, (_event, id: string) => {
    const data = load()
    data.scripts = data.scripts.filter(s => s.id !== id)
    save(data)
    rescheduleAll()
  })

  // Run
  ipcMain.handle(IPC.SCRIPT_RUN, async (event, params: {
    runId: string
    scriptId: string
    connId: string
    connType: string
    variables: Record<string, string>
  }) => {
    const { runId, scriptId, connId, connType, variables } = params
    cancelFlags.set(runId, false)

    const data = load()
    const script = data.scripts.find(s => s.id === scriptId)
    if (!script) {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.SCRIPT_DONE, runId, false)
      }
      return
    }

    let success = true
    for (let i = 0; i < script.steps.length; i++) {
      if (cancelFlags.get(runId)) {
        success = false
        break
      }

      const step = script.steps[i]
      const sendText = resolveVariables(step.send, variables)

      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.SCRIPT_PROGRESS, { runId, stepIndex: i, status: 'running' })
      }

      try {
        // Write to connection
        await writeToConnection(connId, connType, sendText + '\r')

        // Wait for expect pattern if specified
        if (step.expect) {
          const pattern = new RegExp(step.expect)
          const timeout = step.timeoutMs ?? 10000
          const output = await waitForExpect(connId, pattern, timeout)
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC.SCRIPT_PROGRESS, { runId, stepIndex: i, status: 'passed', output: output.slice(-200) })
          }
        } else {
          // No expect — small delay for command to process, then mark passed
          await new Promise(r => setTimeout(r, 200))
          if (!event.sender.isDestroyed()) {
            event.sender.send(IPC.SCRIPT_PROGRESS, { runId, stepIndex: i, status: 'passed' })
          }
        }
      } catch (e: unknown) {
        const isTimeout = (e instanceof Error) && e.message === 'timeout'
        const status = isTimeout ? 'timeout' : 'failed'
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.SCRIPT_PROGRESS, { runId, stepIndex: i, status })
        }
        success = false
        break
      }
    }

    cancelFlags.delete(runId)
    if (!event.sender.isDestroyed()) {
      event.sender.send(IPC.SCRIPT_DONE, runId, success)
    }
  })

  ipcMain.handle(IPC.SCRIPT_CANCEL, (_event, runId: string) => {
    cancelFlags.set(runId, true)
  })

  // Kick off any scheduled scripts on startup
  rescheduleAll()
}
