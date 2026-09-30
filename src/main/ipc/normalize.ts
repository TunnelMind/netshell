/**
 * Multi-vendor command normalization.
 * Runs vendor-appropriate show commands against a live session and parses
 * the output into vendor-neutral data structures.
 */
import { ipcMain } from 'electron'
import { IPC } from '../../types'
import type { Vendor } from '../../types'
import { runCommandGetOutput } from './compliance'
import { parseInterfaces, parseBgp, parseArp, parseDevice } from '../../core/normalize'

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
