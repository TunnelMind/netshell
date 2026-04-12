/**
 * JIT (Just-In-Time) credential approval workflow.
 * When a credential has jitEnabled=true, the user must request access
 * which POSTs to a Slack/Teams/custom webhook.  An HTTP callback server
 * on localhost:7334 receives the approve/deny action and notifies the renderer.
 */
import { ipcMain, WebContents } from 'electron'
import * as http from 'http'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { JitRequest } from '../../types'
import { load } from '../store'

const pending = new Map<string, { req: JitRequest; sender: WebContents }>()

let callbackServer: http.Server | null = null

function startCallbackServer(): void {
  if (callbackServer) return

  callbackServer = http.createServer((req, res) => {
    // Path: /jit/<requestId>/<action>   where action = approved | denied
    const match = req.url?.match(/^\/jit\/([^/]+)\/(approved|denied)/)
    if (!match) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const [, requestId, action] = match
    const entry = pending.get(requestId)
    if (!entry) {
      res.writeHead(410)
      res.end('Request expired or unknown')
      return
    }

    entry.req.status = action as 'approved' | 'denied'
    if (action === 'approved') {
      if (!entry.req.expiresAt) {
        const ttl = load().credentials.find(c => c.id === entry.req.credentialId)?.jitTtlMinutes ?? 60
        entry.req.expiresAt = Date.now() + ttl * 60 * 1000
      }

      if (!entry.sender.isDestroyed()) {
        entry.sender.send(IPC.JIT_APPROVED, entry.req)
      }
    } else {
      if (!entry.sender.isDestroyed()) {
        entry.sender.send(IPC.JIT_DENIED, entry.req)
      }
    }

    pending.delete(requestId)

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<html><body><h2>Access ${action}.</h2><p>You can close this tab.</p></body></html>`)
  })

  callbackServer.listen(7334, '127.0.0.1')
}

async function postWebhook(url: string, req: JitRequest): Promise<void> {
  const callbackBase = 'http://localhost:7334/jit'
  const body = JSON.stringify({
    text: `*NetShell JIT Access Request*\n` +
      `Credential: ${req.credentialId}\nSession: ${req.sessionName}\n` +
      `Requested by: ${req.requestedBy}\n` +
      (req.reason ? `Reason: ${req.reason}\n` : '') +
      `\n<${callbackBase}/${req.requestId}/approved|✅ Approve> | ` +
      `<${callbackBase}/${req.requestId}/denied|❌ Deny>`,
    // Teams-compatible card fallback
    type: 'AdaptiveCard',
  })

  await new Promise<void>((resolve, reject) => {
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const proto = u.protocol === 'https:' ? require('https') : require('http')
    const r = proto.request(options, (res: http.IncomingMessage) => {
      res.resume()
      res.on('end', resolve)
    })
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

// Expire pending requests that have been waiting more than 30 minutes
const EXPIRY_CHECK_INTERVAL = 5 * 60 * 1000  // 5 min
const REQUEST_TTL = 30 * 60 * 1000           // 30 min

let expiryTimer: NodeJS.Timeout | null = null

function startExpiryCleanup(): void {
  if (expiryTimer) return
  expiryTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, entry] of pending) {
      if (now - entry.req.ts > REQUEST_TTL) {
        if (!entry.sender.isDestroyed()) {
          entry.sender.send(IPC.JIT_DENIED, { ...entry.req, status: 'denied' })
        }
        pending.delete(id)
      }
    }
  }, EXPIRY_CHECK_INTERVAL)
  expiryTimer.unref?.()
}

export function registerJitHandlers(): void {
  startCallbackServer()
  startExpiryCleanup()

  ipcMain.handle(IPC.JIT_REQUEST, async (event, params: {
    credentialId: string
    sessionName: string
    requestedBy: string
    reason?: string
  }) => {
    const settings = load().settings
    const webhookUrl = load().credentials.find(c => c.id === params.credentialId)?.jitApprovalUrl
      ?? settings.approvalWebhookUrl

    const req: JitRequest = {
      requestId: uuidv4(),
      credentialId: params.credentialId,
      sessionName: params.sessionName,
      requestedBy: params.requestedBy,
      reason: params.reason,
      ts: Date.now(),
      status: 'pending',
    }

    pending.set(req.requestId, { req, sender: event.sender })

    if (webhookUrl) {
      try { await postWebhook(webhookUrl, req) } catch { /* webhook failures are non-fatal */ }
    }

    return req
  })

  ipcMain.handle(IPC.JIT_GET_PENDING, () => {
    return Array.from(pending.values()).map(e => e.req)
  })
}

export function cleanupJit(): void {
  callbackServer?.close()
  callbackServer = null
  if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null }
  pending.clear()
}
