/**
 * AWS Systems Manager Session Manager transport.
 * Spawns `aws ssm start-session` as a subprocess and pipes through xterm.
 * Requires: AWS CLI v2 + Session Manager Plugin installed on the host.
 */
import { ipcMain, WebContents } from 'electron'
import * as child_process from 'child_process'
import { IPC } from '../../types'

// On Windows, AWS CLI v2 installs as `aws.cmd`; on macOS/Linux it's `aws`
const AWS_BIN = process.platform === 'win32' ? 'aws.cmd' : 'aws'

interface ActiveSSM {
  proc: child_process.ChildProcess
  sender: WebContents
}

const connections = new Map<string, ActiveSSM>()

function makeConnId(sessionId: string): string {
  return `ssm-${sessionId}-${Date.now()}`
}

export function registerSsmHandlers(): void {
  ipcMain.handle(IPC.SSM_LIST_INSTANCES, async (_event, params: {
    region?: string
    profile?: string
  }) => {
    const args = ['describe-instance-information', '--output', 'json']
    if (params.region) args.push('--region', params.region)

    const env: NodeJS.ProcessEnv = { ...process.env }
    if (params.profile) env.AWS_PROFILE = params.profile

    return new Promise((resolve, reject) => {
      child_process.execFile(AWS_BIN, ['ssm', ...args], { env, timeout: 10000 }, (err, stdout) => {
        if (err) { reject(new Error(err.message)); return }
        try {
          const data = JSON.parse(stdout)
          resolve((data.InstanceInformationList ?? []).map((i: any) => ({
            instanceId: i.InstanceId,
            name: i.ComputerName ?? i.InstanceId,
            platform: i.PlatformType,
            pingStatus: i.PingStatus,
            ipAddress: i.IPAddress,
          })))
        } catch (parseErr) { reject(new Error('Failed to parse AWS response')) }
      })
    })
  })

  ipcMain.handle(IPC.SSM_CONNECT, async (event, params: {
    sessionId: string
    instanceId: string
    region?: string
    profile?: string
    rows: number
    cols: number
  }) => {
    const connId = makeConnId(params.sessionId)
    const sender = event.sender

    const args = ['ssm', 'start-session', '--target', params.instanceId]
    if (params.region) { args.push('--region', params.region) }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLUMNS: String(params.cols),
      LINES: String(params.rows),
    }
    if (params.profile) env.AWS_PROFILE = params.profile

    const proc = child_process.spawn(AWS_BIN, args.slice(1), {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout?.on('data', (data: Buffer) => {
      if (!sender.isDestroyed()) sender.send(IPC.SSM_DATA, connId, data.toString('binary'))
    })
    proc.stderr?.on('data', (data: Buffer) => {
      if (!sender.isDestroyed()) sender.send(IPC.SSM_DATA, connId, data.toString('binary'))
    })
    proc.on('close', () => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.SSM_CLOSED, connId)
    })
    proc.on('error', (err: Error) => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.SSM_ERROR, connId, err.message)
    })

    if (proc.pid === undefined) {
      return Promise.reject(new Error('Failed to spawn aws ssm start-session. Ensure AWS CLI v2 and Session Manager Plugin are installed.'))
    }

    connections.set(connId, { proc, sender })
    return { connId }
  })

  ipcMain.handle(IPC.SSM_WRITE, (_event, connId: string, data: string) => {
    const conn = connections.get(connId)
    if (conn?.proc.stdin) conn.proc.stdin.write(Buffer.from(data, 'binary'))
  })

  ipcMain.handle(IPC.SSM_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      try { conn.proc.kill('SIGTERM') } catch {}
      connections.delete(connId)
    }
  })
}

export function cleanupSsmConnections(): void {
  for (const [, conn] of connections) {
    try { conn.proc.kill() } catch {}
  }
  connections.clear()
}
