/**
 * Multi-vendor command normalization.
 * Runs vendor-appropriate show commands against a live session and parses
 * the output into vendor-neutral data structures.
 */
import { ipcMain } from 'electron'
import { IPC } from '../../types'
import type { Vendor, NormalizedInterface, NormalizedBgpPeer, NormalizedArpEntry, NormalizedDeviceInfo } from '../../types'
import { runCommandGetOutput } from './compliance'

export function registerNormalizeHandlers(): void {
  ipcMain.handle(IPC.NORMALIZE_INTERFACES, async (_event, params: {
    connId: string
    connType: string
    vendor: Vendor
  }) => {
    const cmd = params.vendor === 'junos' ? 'show interfaces terse' : 'show interfaces'
    const output = await runCommandGetOutput(params.connId, params.connType, cmd)
    return parseInterfaces(output, params.vendor)
  })

  ipcMain.handle(IPC.NORMALIZE_BGP, async (_event, params: {
    connId: string
    connType: string
    vendor: Vendor
  }) => {
    const output = await runCommandGetOutput(params.connId, params.connType, 'show bgp summary')
    return parseBgp(output, params.vendor)
  })

  ipcMain.handle(IPC.NORMALIZE_ARP, async (_event, params: {
    connId: string
    connType: string
    vendor: Vendor
  }) => {
    const cmd = params.vendor === 'junos' ? 'show arp' : 'show ip arp'
    const output = await runCommandGetOutput(params.connId, params.connType, cmd)
    return parseArp(output, params.vendor)
  })

  ipcMain.handle(IPC.NORMALIZE_DEVICE, async (_event, params: {
    connId: string
    connType: string
    vendor: Vendor
  }) => {
    const output = await runCommandGetOutput(params.connId, params.connType, 'show version')
    return parseDevice(output, params.vendor)
  })
}

// ─── Interface parsers ────────────────────────────────────────────────────────

function parseInterfaces(output: string, vendor: Vendor): NormalizedInterface[] {
  const results: NormalizedInterface[] = []

  if (vendor === 'junos') {
    // JunOS "show interfaces terse" — columns: Interface State Admin Link
    for (const line of output.split('\n')) {
      const m = line.match(/^(\S+)\s+(up|down)\s+(up|down)/i)
      if (!m) continue
      results.push({
        name: m[1],
        status: m[2].toLowerCase() === 'up' && m[3].toLowerCase() === 'up' ? 'up'
          : m[2].toLowerCase() === 'down' ? 'admin-down' : 'down',
      })
    }
    return results
  }

  // IOS / NXOS / EOS — parse "show interfaces" block format
  const blocks = output.split(/^(?=\S)/m)
  for (const block of blocks) {
    // First line: "GigabitEthernet0/1 is up, line protocol is up"
    const header = block.match(/^(\S+)\s+is\s+(up|down|administratively down),\s+line protocol is\s+(up|down)/i)
    if (!header) continue

    const intf: NormalizedInterface = {
      name: header[1],
      status: header[1].toLowerCase().includes('admin') ? 'admin-down'
        : header[2].toLowerCase() === 'up' ? 'up' : 'down',
    }

    const desc  = block.match(/Description:\s*(.+)/i)
    const speed = block.match(/BW (\d+) Kbit|(\d+)Mb\/s|(\d+)Gb\/s/i)
    const mtu   = block.match(/MTU (\d+)/i)
    const ip    = block.match(/Internet address is (\S+)/i)
    const errIn = block.match(/(\d+) input errors/i)
    const errOut = block.match(/(\d+) output errors/i)

    if (desc)  intf.description = desc[1].trim()
    if (mtu)   intf.mtu = parseInt(mtu[1])
    if (ip)    intf.ipv4 = ip[1]
    if (errIn)  intf.errorIn  = parseInt(errIn[1])
    if (errOut) intf.errorOut = parseInt(errOut[1])

    if (speed) {
      if (speed[3])      intf.speedMbps = parseInt(speed[3]) * 1000
      else if (speed[2]) intf.speedMbps = parseInt(speed[2])
      else if (speed[1]) intf.speedMbps = Math.round(parseInt(speed[1]) / 1000)
    }

    results.push(intf)
  }
  return results
}

// ─── BGP parsers ──────────────────────────────────────────────────────────────

function parseBgp(output: string, _vendor: Vendor): NormalizedBgpPeer[] {
  const results: NormalizedBgpPeer[] = []
  // IOS/NXOS/EOS "show bgp summary" table format:
  // Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
  // 10.0.0.1        4 65001     123     456        0    0    0 01:23:45      100
  const tableStart = output.search(/Neighbor\s+V\s+AS/i)
  if (tableStart < 0) return results

  const tableLines = output.slice(tableStart).split('\n').slice(2)
  for (const line of tableLines) {
    const cols = line.trim().split(/\s+/)
    if (cols.length < 9) continue
    const ip = cols[0]
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) && !ip.includes(':')) continue

    const asn = parseInt(cols[2])
    const stateOrPfx = cols[cols.length - 1]
    const state = /^\d+$/.test(stateOrPfx) ? 'Established' : stateOrPfx
    const pfxRcvd = /^\d+$/.test(stateOrPfx) ? parseInt(stateOrPfx) : undefined

    // Parse uptime "01:23:45" or "1d02h" → seconds (best-effort)
    const uptimeStr = cols[cols.length - 2]
    let uptimeSec: number | undefined
    const hhmmss = uptimeStr.match(/^(\d+):(\d+):(\d+)$/)
    if (hhmmss) {
      uptimeSec = parseInt(hhmmss[1]) * 3600 + parseInt(hhmmss[2]) * 60 + parseInt(hhmmss[3])
    }

    results.push({ neighborAddress: ip, asn, state, prefixesReceived: pfxRcvd, uptimeSeconds: uptimeSec })
  }
  return results
}

// ─── ARP parsers ──────────────────────────────────────────────────────────────

function parseArp(output: string, vendor: Vendor): NormalizedArpEntry[] {
  const results: NormalizedArpEntry[] = []

  if (vendor === 'junos') {
    // "show arp": IP=10.0.0.1 MAC=aa:bb:cc:dd:ee:ff Interface=ge-0/0/0.0
    for (const line of output.split('\n')) {
      const m = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s+(\S+)/i)
      if (!m) continue
      results.push({ ip: m[1], mac: m[2], interface: m[3] })
    }
    return results
  }

  // IOS/NXOS/EOS: Protocol  Address  Age  Hardware Addr  Type  Interface
  for (const line of output.split('\n')) {
    const m = line.match(/Internet\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+|-)\s+([0-9a-f.]{14})\s+\S+\s+(\S+)/i)
    if (!m) continue
    // Convert dotted MAC (aabb.ccdd.eeff) to colon notation
    const rawMac = m[3].replace(/\./g, '')
    const mac = rawMac.match(/.{2}/g)?.join(':') ?? m[3]
    const age = m[2] !== '-' ? parseInt(m[2]) : undefined
    results.push({ ip: m[1], mac, interface: m[4], age })
  }
  return results
}

// ─── Device info parser ───────────────────────────────────────────────────────

function parseDevice(output: string, vendor: Vendor): NormalizedDeviceInfo {
  const info: NormalizedDeviceInfo = { vendor }

  if (vendor === 'junos') {
    const hostname = output.match(/Hostname:\s*(\S+)/i)
    const model    = output.match(/Model:\s*(.+)/i)
    const version  = output.match(/Junos:\s*(\S+)/i)
    if (hostname) info.hostname = hostname[1]
    if (model)    info.model    = model[1].trim()
    if (version)  info.version  = version[1]
    return info
  }

  // IOS / NXOS / EOS
  const hostname = output.match(/(\S+)\s+uptime is/i)
  const version  = output.match(/Version\s+(\S+[^\s,]+)/i)
  const model    = output.match(/(?:cisco|arista)\s+(\S+)/i)
  const serial   = output.match(/Processor board ID\s+(\S+)/i) ?? output.match(/System serial number\s+:\s*(\S+)/i)
  const uptime   = output.match(/uptime is\s+(.+)/i)

  if (hostname) info.hostname = hostname[1]
  if (version)  info.version  = version[1]
  if (model)    info.model    = model[1]
  if (serial)   info.serialNumber = serial[1]
  if (uptime)   info.uptime   = uptime[1].trim()

  return info
}
