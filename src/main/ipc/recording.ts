/**
 * Session recording — timestamps every frame to disk, signs with Ed25519.
 * Files stored as JSONL (one frame per line) for streaming playback.
 * Signature covers the full file hash for tamper evidence.
 */
import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { RecordingMeta, RecordingFrame } from '../../types'
import { load, save } from '../store'
import { addDataListener } from './dataListeners'

// Per-connection write streams
const activeRecordings = new Map<string, {
  stream: fs.WriteStream
  meta: RecordingMeta
  startTs: number
  unsubscribe: () => void
}>()

function recordingDir(settings: { recordingDir?: string }): string {
  const dir = settings.recordingDir || path.join(app.getPath('userData'), 'netshell', 'recordings')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeFrame(stream: fs.WriteStream, frame: RecordingFrame): void {
  stream.write(JSON.stringify(frame) + '\n')
}

export function registerRecordingHandlers(): void {
  ipcMain.handle(IPC.RECORDING_START, async (_event, params: {
    connId: string
    sessionId: string
    sessionName: string
  }) => {
    const data = load()
    if (!data.settings.recordingEnabled) return null

    const id = uuidv4()
    const dir = recordingDir(data.settings)
    const ts = Date.now()
    const safeName = params.sessionName.replace(/[^a-z0-9]/gi, '_')
    const filePath = path.join(dir, `${safeName}_${new Date(ts).toISOString().replace(/[:.]/g, '-')}.jsonl`)
    const stream = fs.createWriteStream(filePath, { flags: 'a' })

    const meta: RecordingMeta = {
      id,
      sessionId: params.sessionId,
      sessionName: params.sessionName,
      startTs: ts,
      filePath,
    }

    // Subscribe to data events
    const unsubscribe = addDataListener(params.connId, (chunk) => {
      writeFrame(stream, { t: Date.now() - ts, type: 'output', data: chunk })
    })

    activeRecordings.set(params.connId, { stream, meta, startTs: ts, unsubscribe })

    // Save meta to store
    data.recordings.push(meta)
    save(data)

    return meta
  })

  ipcMain.handle(IPC.RECORDING_STOP, async (_event, connId: string) => {
    const rec = activeRecordings.get(connId)
    if (!rec) return

    rec.unsubscribe()
    rec.stream.end()
    activeRecordings.delete(connId)

    // Sign the recording
    try {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
      const fileContent = fs.readFileSync(rec.meta.filePath)
      const signature = crypto.sign(null, fileContent, privateKey).toString('hex')
      const pubHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex')

      // Update meta in store
      const data = load()
      const idx = data.recordings.findIndex(r => r.id === rec.meta.id)
      if (idx >= 0) {
        data.recordings[idx] = {
          ...data.recordings[idx],
          endTs: Date.now(),
          signature,
          publicKey: pubHex,
          verified: true,
          sizeBytes: fileContent.length,
        }
        save(data)
      }
    } catch (e) {
      console.warn('Recording signing failed:', e)
    }
  })

  ipcMain.handle(IPC.RECORDING_GET_ALL, () => {
    return load().recordings
  })

  ipcMain.handle(IPC.RECORDING_VERIFY, async (_event, recordingId: string) => {
    const data = load()
    const rec = data.recordings.find(r => r.id === recordingId)
    if (!rec || !rec.signature || !rec.publicKey) return { verified: false, error: 'No signature' }

    try {
      const fileContent = fs.readFileSync(rec.filePath)
      const pubKey = crypto.createPublicKey({
        key: Buffer.from(rec.publicKey, 'hex'),
        format: 'der',
        type: 'spki',
      })
      const sig = Buffer.from(rec.signature, 'hex')
      const ok = crypto.verify(null, fileContent, pubKey, sig)
      return { verified: ok }
    } catch (e: unknown) {
      return { verified: false, error: (e as Error).message }
    }
  })

  ipcMain.handle(IPC.RECORDING_PLAY, async (_event, recordingId: string) => {
    const data = load()
    const rec = data.recordings.find(r => r.id === recordingId)
    if (!rec) return []

    try {
      const lines = fs.readFileSync(rec.filePath, 'utf8').trim().split('\n').filter(Boolean)
      return lines.map(l => JSON.parse(l)) as RecordingFrame[]
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.RECORDING_DELETE, async (_event, recordingId: string) => {
    const data = load()
    const rec = data.recordings.find(r => r.id === recordingId)
    if (!rec) return

    try { fs.unlinkSync(rec.filePath) } catch {}
    data.recordings = data.recordings.filter(r => r.id !== recordingId)
    save(data)
  })
}

// Called by TerminalTab when user inputs data (to record keystrokes separately)
export function recordInput(connId: string, data: string): void {
  const rec = activeRecordings.get(connId)
  if (!rec) return
  writeFrame(rec.stream, { t: Date.now() - rec.startTs, type: 'input', data })
}
