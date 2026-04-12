/**
 * Kubernetes exec session — runs an interactive shell in a pod container
 * using @kubernetes/client-node WebSocket exec API.
 * No kubectl binary required.
 */
import { ipcMain, WebContents } from 'electron'
import { IPC } from '../../types'

// Lazy load to avoid startup cost
let k8sLoaded = false
let KubeConfig: any, Exec: any, WsRead: any

async function loadK8s() {
  if (!k8sLoaded) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@kubernetes/client-node')
    KubeConfig = mod.KubeConfig
    Exec = mod.Exec
    k8sLoaded = true
  }
}

interface ActiveK8s {
  conn: any
  sender: WebContents
}

const connections = new Map<string, ActiveK8s>()

function makeConnId(sessionId: string): string {
  return `k8s-${sessionId}-${Date.now()}`
}

export function registerK8sHandlers(): void {
  ipcMain.handle(IPC.K8S_LIST_CONTEXTS, async () => {
    try {
      await loadK8s()
      const kc = new KubeConfig()
      kc.loadFromDefault()
      return kc.getContexts().map((c: any) => ({
        name: c.name,
        cluster: c.cluster,
        user: c.user,
        current: c.name === kc.getCurrentContext(),
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.K8S_LIST_PODS, async (_event, params: {
    context?: string
    namespace?: string
  }) => {
    try {
      await loadK8s()
      const kc = new KubeConfig()
      kc.loadFromDefault()
      if (params.context) kc.setCurrentContext(params.context)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { CoreV1Api } = require('@kubernetes/client-node')
      const api = kc.makeApiClient(CoreV1Api)
      const ns = params.namespace || 'default'
      const res = await api.listNamespacedPod(ns)
      return (res.body.items ?? []).map((p: any) => ({
        name: p.metadata?.name,
        namespace: p.metadata?.namespace ?? ns,
        status: p.status?.phase,
        containers: (p.spec?.containers ?? []).map((c: any) => c.name),
        ready: (p.status?.containerStatuses ?? []).every((s: any) => s.ready),
      }))
    } catch (e: unknown) {
      throw new Error(`K8s pod list failed: ${(e as Error).message}`)
    }
  })

  ipcMain.handle(IPC.K8S_CONNECT, async (event, params: {
    sessionId: string
    context?: string
    namespace: string
    pod: string
    container?: string
    rows: number
    cols: number
  }) => {
    await loadK8s()
    const connId = makeConnId(params.sessionId)
    const sender = event.sender

    const kc = new KubeConfig()
    kc.loadFromDefault()
    if (params.context) kc.setCurrentContext(params.context)

    const exec = new Exec(kc)

    // Use a WebSocket to the exec endpoint
    const command = ['/bin/sh', '-c', 'TERM=xterm-256color; export TERM; [ -f /bin/bash ] && exec /bin/bash || exec /bin/sh']
    const conn = await exec.exec(
      params.namespace,
      params.pod,
      params.container || '',
      command,
      // stdout
      {
        write: (data: Buffer) => {
          if (!sender.isDestroyed()) sender.send(IPC.K8S_DATA, connId, data.toString('binary'))
        },
      },
      // stderr
      {
        write: (data: Buffer) => {
          if (!sender.isDestroyed()) sender.send(IPC.K8S_DATA, connId, data.toString('binary'))
        },
      },
      // stdin
      true,
      // tty
      true
    )

    conn.on('close', () => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.K8S_CLOSED, connId)
    })

    conn.on('error', (err: Error) => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.K8S_ERROR, connId, err.message)
    })

    connections.set(connId, { conn, sender })
    return { connId }
  })

  ipcMain.handle(IPC.K8S_WRITE, (_event, connId: string, data: string) => {
    const conn = connections.get(connId)
    if (conn) {
      try {
        conn.conn.stdin?.write(data)
      } catch {
        // connection may have closed
      }
    }
  })

  ipcMain.handle(IPC.K8S_RESIZE, (_event, connId: string, rows: number, cols: number) => {
    const conn = connections.get(connId)
    if (conn) {
      try {
        // Send SIGWINCH-equivalent via xterm resize channel
        const resize = JSON.stringify({ Width: cols, Height: rows })
        conn.conn.send(Buffer.concat([Buffer.from([4]), Buffer.from(resize)]))
      } catch {}
    }
  })

  ipcMain.handle(IPC.K8S_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      try { conn.conn.close() } catch {}
      connections.delete(connId)
    }
  })
}

export function cleanupK8sConnections(): void {
  for (const [, conn] of connections) {
    try { conn.conn.close() } catch {}
  }
  connections.clear()
}
