/**
 * License enforcement — Ed25519 signature verification, expiry gating.
 *
 * HOW IT WORKS
 * ────────────
 * 1. User buys → your server issues them a signed LicenseCert.
 * 2. User enters their license key in the app.
 * 3. App POSTs to LICENSE_SERVER_URL/activate with { key, machineId }.
 * 4. Server responds with { cert: LicenseCert, sig: string }.
 * 5. App verifies sig using the embedded public key, then stores cert locally.
 * 6. On every launch the cert is re-verified offline (signature + expiry).
 * 7. A background timer refreshes the cert from the server weekly.
 *
 * LICENSE SERVER ENDPOINTS (implement on your backend):
 *   POST /activate  { key, machineId } → { cert, sig } | { error }
 *   POST /check     { key, machineId } → { cert, sig } | { error }
 *
 * GENERATING YOUR KEY PAIR (run once, store private key securely):
 *   node -e "
 *     const c=require('crypto');
 *     const {publicKey,privateKey}=c.generateKeyPairSync('ed25519');
 *     console.log('pub:', publicKey.export({type:'spki',format:'der'}).toString('hex'));
 *     console.log('priv:', privateKey.export({type:'pkcs8',format:'der'}).toString('hex'));
 *   "
 *   Replace LICENSE_PUBLIC_KEY_HEX below with your public key.
 *   Keep the private key on your license server — never ship it in the app.
 *
 * SIGNING A CERT ON YOUR SERVER (Node.js example):
 *   const cert = { key, email, tier, issuedAt, expiresAt, seats };
 *   const sig = crypto.sign(null, Buffer.from(canonicalJson(cert)), privateKey).toString('hex');
 *   return { cert, sig };
 *
 * canonicalJson = (obj) => JSON.stringify(obj, Object.keys(obj).sort())
 */

import { ipcMain, app, BrowserWindow } from 'electron'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import * as os from 'os'
import { IPC } from '../../types'
import type { LicenseCert, LicenseState, StoredLicense } from '../../types'

// ─── Config ────────────────────────────────────────────────────────────────

/**
 * Your Ed25519 public key (hex SPKI DER).
 * Replace this with the public key from your key pair.
 */
const LICENSE_PUBLIC_KEY_HEX =
  '302a300506032b6570032100653b2287dad0a0479ef5a557c44fdc6b338952d78dba99b5455945a433b10efd'

/**
 * Your license activation server URL.
 * Set LICENSE_SERVER_URL at build time to override.
 */
const LICENSE_SERVER_URL =
  process.env.LICENSE_SERVER_URL ?? 'https://license.netshell.app'

/** Days after expiry before hard-blocking the app (default if cert omits graceDays). */
const DEFAULT_GRACE_DAYS = 3

/** How often to re-check the license server in the background (ms). */
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000  // 1 week

// ─── Helpers ───────────────────────────────────────────────────────────────

function licensePath(): string {
  return path.join(app.getPath('userData'), 'netshell-license.json')
}

/** Stable fingerprint of this machine — used for machine-bound certs. */
function getMachineId(): string {
  const raw = `${os.platform()}|${os.arch()}|${os.hostname()}|${os.cpus()[0]?.model ?? ''}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

/** Canonical JSON for signing: keys sorted alphabetically. */
function canonicalJson(obj: object): string {
  return JSON.stringify(obj, Object.keys(obj).sort() as any)
}

function loadPublicKey(): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.from(LICENSE_PUBLIC_KEY_HEX, 'hex'),
    format: 'der',
    type: 'spki',
  })
}

function verifySig(cert: LicenseCert, sigHex: string): boolean {
  try {
    const pubKey = loadPublicKey()
    return crypto.verify(null, Buffer.from(canonicalJson(cert)), pubKey, Buffer.from(sigHex, 'hex'))
  } catch {
    return false
  }
}

function readStored(): StoredLicense | null {
  try {
    return JSON.parse(fs.readFileSync(licensePath(), 'utf8')) as StoredLicense
  } catch {
    return null
  }
}

function writeStored(stored: StoredLicense): void {
  fs.mkdirSync(path.dirname(licensePath()), { recursive: true })
  fs.writeFileSync(licensePath(), JSON.stringify(stored, null, 2), 'utf8')
}

function clearStored(): void {
  try { fs.unlinkSync(licensePath()) } catch {}
}

function evaluateCert(cert: LicenseCert): LicenseState {
  const now = Date.now()
  const msLeft = cert.expiresAt - now
  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24))
  const graceDays = cert.graceDays ?? DEFAULT_GRACE_DAYS
  const graceCutoff = cert.expiresAt + graceDays * 24 * 60 * 60 * 1000

  if (now < cert.expiresAt) {
    return { status: 'valid', cert, daysLeft }
  }
  if (now < graceCutoff) {
    return { status: 'grace', cert, daysLeft }
  }
  return { status: 'expired', cert }
}

export function getLicenseState(): LicenseState {
  const stored = readStored()
  if (!stored) return { status: 'none' }

  if (!verifySig(stored.cert, stored.sig)) {
    return { status: 'invalid', error: 'License signature is invalid.' }
  }

  // Machine binding check
  if (stored.cert.machineId && stored.cert.machineId !== getMachineId()) {
    return { status: 'invalid', error: 'License is bound to a different machine.' }
  }

  return evaluateCert(stored.cert)
}

// ─── Server communication ──────────────────────────────────────────────────

async function serverRequest(
  endpoint: string,
  body: object
): Promise<{ cert: LicenseCert; sig: string }> {
  const url = new URL(endpoint, LICENSE_SERVER_URL)
  const payload = JSON.stringify(body)
  const lib = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 15000,
      },
      (res) => {
        let data = ''
        res.on('data', (c: Buffer) => { data += c.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) return reject(new Error(json.error))
            if (!json.cert || !json.sig) return reject(new Error('Invalid server response'))
            resolve(json as { cert: LicenseCert; sig: string })
          } catch {
            reject(new Error('Failed to parse license server response'))
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('License server timed out')) })
    req.write(payload)
    req.end()
  })
}

// ─── Background refresh ────────────────────────────────────────────────────

let refreshTimer: NodeJS.Timeout | null = null

function scheduleRefresh(): void {
  if (refreshTimer) return
  refreshTimer = setInterval(async () => {
    const stored = readStored()
    if (!stored) return
    try {
      const { cert, sig } = await serverRequest('/check', {
        key: stored.cert.key,
        machineId: getMachineId(),
      })
      if (verifySig(cert, sig)) {
        writeStored({ ...stored, cert, sig, lastCheckedAt: Date.now() })

        // If license just expired, notify all windows
        const state = evaluateCert(cert)
        if (state.status === 'expired') {
          BrowserWindow.getAllWindows().forEach(w => {
            if (!w.isDestroyed()) w.webContents.send(IPC.LICENSE_EXPIRED)
          })
        }
      }
    } catch {
      // Offline or server error — silently continue with cached cert
    }
  }, REFRESH_INTERVAL_MS)
  refreshTimer.unref?.()
}

// ─── IPC handlers ─────────────────────────────────────────────────────────

export function registerLicenseHandlers(): void {
  ipcMain.handle(IPC.LICENSE_STATUS, () => getLicenseState())

  ipcMain.handle(IPC.LICENSE_ACTIVATE, async (_event, key: string) => {
    const trimmed = key.trim().toUpperCase()
    if (!trimmed) throw new Error('License key is required.')

    let cert: LicenseCert
    let sig: string

    try {
      const result = await serverRequest('/activate', {
        key: trimmed,
        machineId: getMachineId(),
      })
      cert = result.cert
      sig = result.sig
    } catch (e: unknown) {
      throw new Error(`Activation failed: ${(e as Error).message}`)
    }

    if (!verifySig(cert, sig)) {
      throw new Error('License server returned an invalid signature. Contact support.')
    }

    const state = evaluateCert(cert)
    if (state.status === 'expired') {
      throw new Error('This license has already expired. Please renew.')
    }

    writeStored({ cert, sig, activatedAt: Date.now(), lastCheckedAt: Date.now() })
    scheduleRefresh()
    return getLicenseState()
  })

  ipcMain.handle(IPC.LICENSE_DEACTIVATE, () => {
    clearStored()
    return { status: 'none' } as LicenseState
  })

  scheduleRefresh()
}

export function cleanupLicense(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}
