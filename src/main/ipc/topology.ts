/**
 * Network topology store + LLDP/CDP discovery.
 * Nodes and links are stored in the JSON store.
 * LLDP discovery runs "show lldp neighbors detail" against a live session
 * and parses the output into TopologyNode + TopologyLink records.
 */
import { ipcMain } from 'electron'
import { IPC } from '../../types'
import type { TopologyNode, TopologyLink } from '../../types'
import { load, save } from '../store'
import { runCommandGetOutput } from './compliance'
import { parseCdpNeighbors, parseLldpNeighbors } from '../../core/topology'

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

    return usedCdp
      ? parseCdpNeighbors(output, params.localNodeId)
      : parseLldpNeighbors(output, params.localNodeId)
  })
}
