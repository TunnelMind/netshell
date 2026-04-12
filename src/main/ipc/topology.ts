/**
 * Network topology store + LLDP/CDP discovery.
 * Nodes and links are stored in the JSON store.
 * LLDP discovery runs "show lldp neighbors detail" against a live session
 * and parses the output into TopologyNode + TopologyLink records.
 */
import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC } from '../../types'
import type { TopologyNode, TopologyLink } from '../../types'
import { load, save } from '../store'
import { runCommandGetOutput } from './compliance'

export function registerTopologyHandlers(): void {
  ipcMain.handle(IPC.TOPOLOGY_GET, () => {
    const data = load()
    return { nodes: data.topologyNodes, links: data.topologyLinks }
  })

  ipcMain.handle(IPC.TOPOLOGY_SAVE, (_event, params: {
    nodes: TopologyNode[]
    links: TopologyLink[]
  }) => {
    const data = load()
    data.topologyNodes = params.nodes
    data.topologyLinks = params.links
    save(data)
  })

  ipcMain.handle(IPC.TOPOLOGY_LLDP_DISCOVER, async (_event, params: {
    connId: string
    connType: string
    localNodeId: string   // existing TopologyNode id for the device being queried
  }) => {
    // Try LLDP first, fall back to CDP
    let output = await runCommandGetOutput(params.connId, params.connType, 'show lldp neighbors detail')
    const usedCdp = !output || output.length < 20
    if (usedCdp) {
      output = await runCommandGetOutput(params.connId, params.connType, 'show cdp neighbors detail')
    }

    const nodes: TopologyNode[] = []
    const links: TopologyLink[] = []

    if (usedCdp) {
      // Parse CDP output
      // Example block starts with "Device ID: router1.example.com"
      const blocks = output.split(/^-{5,}/m).filter(b => b.trim())
      for (const block of blocks) {
        const deviceMatch  = block.match(/Device ID:\s*(\S+)/i)
        const ipMatch      = block.match(/IP address:\s*(\S+)/i)
        const localMatch   = block.match(/Interface:\s*(\S+),/i)
        const remoteMatch  = block.match(/Port ID \(outgoing port\):\s*(\S+)/i)
        const capMatch     = block.match(/Capabilities:\s*(.+)/i)

        if (!deviceMatch) continue

        const remoteLabel = deviceMatch[1]
        const node: TopologyNode = {
          id: uuidv4(),
          label: remoteLabel,
          host: ipMatch?.[1],
          type: guessTypeFromCap(capMatch?.[1] ?? ''),
        }
        nodes.push(node)

        const link: TopologyLink = {
          id: uuidv4(),
          source: params.localNodeId,
          target: node.id,
          label: `${localMatch?.[1] ?? '?'} — ${remoteMatch?.[1] ?? '?'}`,
        }
        links.push(link)
      }
    } else {
      // Parse LLDP output
      // Blocks separated by "------------------------------------------------"
      const blocks = output.split(/^-{5,}/m).filter(b => b.trim())
      for (const block of blocks) {
        const sysMatch    = block.match(/System Name:\s*(.+)/i)
        const mgmtMatch   = block.match(/Management Address:\s*(\S+)/i)
        const localMatch  = block.match(/Local Intf:\s*(\S+)/i)
        const portMatch   = block.match(/Port id:\s*(\S+)/i)
        const capMatch    = block.match(/System Capabilities:\s*(.+)/i)

        if (!sysMatch) continue

        const node: TopologyNode = {
          id: uuidv4(),
          label: sysMatch[1].trim(),
          host: mgmtMatch?.[1],
          type: guessTypeFromCap(capMatch?.[1] ?? ''),
        }
        nodes.push(node)

        const link: TopologyLink = {
          id: uuidv4(),
          source: params.localNodeId,
          target: node.id,
          label: `${localMatch?.[1] ?? '?'} — ${portMatch?.[1] ?? '?'}`,
        }
        links.push(link)
      }
    }

    return { nodes, links }
  })
}

function guessTypeFromCap(cap: string): TopologyNode['type'] {
  const c = cap.toLowerCase()
  if (c.includes('router'))   return 'router'
  if (c.includes('switch') || c.includes('bridge')) return 'switch'
  if (c.includes('firewall')) return 'firewall'
  if (c.includes('station') || c.includes('host')) return 'server'
  if (c.includes('wlan') || c.includes('ap'))      return 'ap'
  return 'unknown'
}
