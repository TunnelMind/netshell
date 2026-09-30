/**
 * CDP/LLDP neighbor parsing for topology discovery.
 * Pure: no Electron, no store. The caller runs the show command.
 */
// Node and link ids come from uuidv4() in this order (node, then its link);
// the goldens pin that order through the test uuid stub.
// eslint-disable-next-line import/no-unresolved -- resolver can't read uuid's exports map; tsc resolves it
import { v4 as uuidv4 } from 'uuid'
import type { TopologyNode, TopologyLink } from '../types'

export function parseCdpNeighbors(output: string, localNodeId: string): { nodes: TopologyNode[], links: TopologyLink[] } {
  const nodes: TopologyNode[] = []
  const links: TopologyLink[] = []

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
      source: localNodeId,
      target: node.id,
      label: `${localMatch?.[1] ?? '?'} — ${remoteMatch?.[1] ?? '?'}`,
    }
    links.push(link)
  }

  return { nodes, links }
}

export function parseLldpNeighbors(output: string, localNodeId: string): { nodes: TopologyNode[], links: TopologyLink[] } {
  const nodes: TopologyNode[] = []
  const links: TopologyLink[] = []

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
      source: localNodeId,
      target: node.id,
      label: `${localMatch?.[1] ?? '?'} — ${portMatch?.[1] ?? '?'}`,
    }
    links.push(link)
  }

  return { nodes, links }
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
