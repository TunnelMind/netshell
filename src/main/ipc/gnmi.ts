/**
 * gNMI (gRPC Network Management Interface) transport.
 * Connects to network devices using OpenConfig gNMI over gRPC.
 * Supports streaming subscribe (on_change + sample) and single Get.
 */
import { ipcMain, WebContents, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { IPC } from '../../types'
import type { TelemetryPoint } from '../../types'
import { load } from '../store'
import { getSecret } from './credentials'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const grpc = require('@grpc/grpc-js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const protoLoader = require('@grpc/proto-loader')

// In packaged builds, extraResources places the file in process.resourcesPath.
// In development, it sits next to the main bundle's parent directory.
const PROTO_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'gnmi.proto')
  : path.join(__dirname, '..', 'gnmi.proto')

function loadProto() {
  if (!fs.existsSync(PROTO_PATH)) {
    throw new Error(`gNMI proto not found at ${PROTO_PATH}`)
  }
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  })
  return grpc.loadPackageDefinition(packageDef)
}

interface ActiveGnmi {
  client: any
  call: any
  sender: WebContents
}

const connections = new Map<string, ActiveGnmi>()

function makeConnId(sessionId: string): string {
  return `gnmi-${sessionId}-${Date.now()}`
}

function pathFromString(p: string): { elem: { name: string; key: Record<string, string> }[] } {
  const elem = p.replace(/^\//, '').split('/').map(segment => {
    // Parse "interface[name=Gi0/1]" style keys
    const match = segment.match(/^(\w[\w-]*)\[(.+)\]$/)
    if (match) {
      const name = match[1]
      const key: Record<string, string> = {}
      match[2].split(',').forEach(kv => {
        const [k, v] = kv.split('=')
        key[k] = v
      })
      return { name, key }
    }
    return { name: segment, key: {} }
  })
  return { elem }
}

function extractValue(tv: any): string | number | boolean {
  if (!tv) return ''
  if (tv.string_val !== undefined) return tv.string_val
  if (tv.int_val !== undefined) return parseInt(tv.int_val)
  if (tv.uint_val !== undefined) return parseInt(tv.uint_val)
  if (tv.bool_val !== undefined) return tv.bool_val
  if (tv.float_val !== undefined) return tv.float_val
  if (tv.double_val !== undefined) return tv.double_val
  if (tv.json_ietf_val) return tv.json_ietf_val.toString()
  if (tv.ascii_val) return tv.ascii_val
  return JSON.stringify(tv)
}

function pathToString(p: any): string {
  if (!p?.elem) return '/'
  return '/' + (p.elem as any[]).map((e: any) => {
    const keys = e.key ? Object.entries(e.key).map(([k, v]) => `[${k}=${v}]`).join('') : ''
    return e.name + keys
  }).join('/')
}

export function registerGnmiHandlers(): void {
  ipcMain.handle(IPC.GNMI_CONNECT, async (event, params: {
    sessionId: string
    host: string
    port: number
    credentialId?: string
    insecure?: boolean
    paths: string[]
    sampleIntervalMs?: number
  }) => {
    const connId = makeConnId(params.sessionId)
    const sender = event.sender

    let creds: any
    if (params.insecure) {
      creds = grpc.credentials.createInsecure()
    } else {
      creds = grpc.credentials.createSsl(null, null, null, { checkServerIdentity: () => undefined })
    }

    // Add username/password as gRPC call credentials if credential set
    let callCreds = grpc.CallCredentials.createEmpty()
    if (params.credentialId) {
      const data = load()
      const meta = data.credentials.find(c => c.id === params.credentialId)
      const username = meta?.username ?? 'admin'
      const password = await getSecret(params.credentialId, 'password')
      callCreds = grpc.CallCredentials.createFromMetadataGenerator(
        (_args: any, cb: any) => {
          const m = new grpc.Metadata()
          m.set('username', username)
          if (password) m.set('password', password)
          cb(null, m)
        }
      )
    }
    const combined = grpc.credentials.combineChannelCredentials(creds, callCreds)

    let proto: any
    try { proto = loadProto() } catch (e: unknown) {
      if (!sender.isDestroyed()) sender.send(IPC.GNMI_ERROR, connId, (e as Error).message)
      throw e
    }

    const client = new proto.gnmi.gNMI(`${params.host}:${params.port}`, combined)
    const subscriptions = params.paths.map(p => ({
      path: pathFromString(p),
      mode: 2,  // SAMPLE
      sample_interval: (params.sampleIntervalMs ?? 10000) * 1000000, // ns
    }))

    const call = client.Subscribe()
    call.write({
      subscribe: {
        subscription: subscriptions,
        mode: 0, // STREAM
        encoding: 2, // PROTO
        updates_only: false,
      }
    })

    call.on('data', (response: any) => {
      if (response.update) {
        const notif = response.update
        const ts = parseInt(notif.timestamp ?? '0')
        const prefix = notif.prefix ? pathToString(notif.prefix) : ''
        for (const update of (notif.update ?? [])) {
          const fullPath = prefix + pathToString(update.path)
          const value = extractValue(update.val)
          const point: TelemetryPoint = { ts: ts ? ts / 1e6 : Date.now(), path: fullPath, value }
          if (!sender.isDestroyed()) sender.send(IPC.GNMI_DATA, connId, point)
        }
      }
    })

    call.on('error', (err: Error) => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.GNMI_ERROR, connId, err.message)
    })

    call.on('end', () => {
      connections.delete(connId)
      if (!sender.isDestroyed()) sender.send(IPC.GNMI_CLOSED, connId)
    })

    connections.set(connId, { client, call, sender })
    return { connId }
  })

  ipcMain.handle(IPC.GNMI_GET, async (_event, params: {
    connId: string
    paths: string[]
  }) => {
    const conn = connections.get(params.connId)
    if (!conn) return null

    return new Promise((resolve, reject) => {
      conn.client.Get({
        path: params.paths.map(pathFromString),
        encoding: 2,
      }, (err: Error, response: any) => {
        if (err) return reject(err)
        const results: TelemetryPoint[] = []
        for (const notif of (response.notification ?? [])) {
          for (const update of (notif.update ?? [])) {
            results.push({
              ts: Date.now(),
              path: pathToString(update.path),
              value: extractValue(update.val),
            })
          }
        }
        resolve(results)
      })
    })
  })

  ipcMain.handle(IPC.GNMI_DISCONNECT, (_event, connId: string) => {
    const conn = connections.get(connId)
    if (conn) {
      try { conn.call.end() } catch {}
      try { conn.client.close() } catch {}
      connections.delete(connId)
    }
  })
}

export function cleanupGnmiConnections(): void {
  for (const [, conn] of connections) {
    try { conn.call.end() } catch {}
    try { conn.client.close() } catch {}
  }
  connections.clear()
}
