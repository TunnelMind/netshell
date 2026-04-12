import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { StoreData, AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 14,
  scrollback: 10000,
  defaultLogDir: '',
}

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'netshell-data.json')
}

function defaults(): StoreData {
  return {
    sessions: [],
    credentials: [],
    settings: { ...DEFAULT_SETTINGS, defaultLogDir: path.join(app.getPath('userData'), 'logs') },
    snippets: [],
    scripts: [],
  }
}

export function load(): StoreData {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoreData>
    const d = defaults()
    return {
      sessions: parsed.sessions ?? d.sessions,
      credentials: parsed.credentials ?? d.credentials,
      settings: { ...d.settings, ...(parsed.settings ?? {}) },
      snippets: parsed.snippets ?? d.snippets,
      scripts: parsed.scripts ?? d.scripts,
    }
  } catch {
    return defaults()
  }
}

export function save(data: StoreData): void {
  const p = getStorePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}
