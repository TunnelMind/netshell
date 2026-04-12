/**
 * TopologyMap — D3 force-directed network diagram.
 * Nodes represent devices; links represent physical/logical connections.
 * Supports LLDP/CDP discovery from a live session.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { OpenTab, TopologyNode, TopologyLink } from '../types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  tabs: OpenTab[]
  onFocusTab?: (tabId: string) => void
  onClose: () => void
}

// Node positions persisted in-component (saved to store on request)
interface NodePos { id: string; x: number; y: number }

const NODE_ICONS: Record<TopologyNode['type'], string> = {
  switch: '⊞', router: '◉', firewall: '⬡', server: '▣', ap: '◎', unknown: '●',
}
const NODE_COLORS: Record<TopologyNode['type'], string> = {
  switch: '#3fb950', router: '#1f6feb', firewall: '#f97583', server: '#e3b341', ap: '#79c0ff', unknown: 'var(--fg-dim)',
}

export default function TopologyMap({ tabs, onFocusTab, onClose }: Props) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const [nodes, setNodes]   = useState<TopologyNode[]>([])
  const [links, setLinks]   = useState<TopologyLink[]>([])
  const [positions, setPositions] = useState<Map<string, NodePos>>(new Map())
  const [selected, setSelected]   = useState<string | null>(null)
  const [discoverTab, setDiscoverTab] = useState<string>(tabs[0]?.id ?? '')
  const [status, setStatus] = useState('')
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const svgDims = useRef({ w: 800, h: 500 })

  useEffect(() => {
    window.api.topology.get().then(({ nodes: ns, links: ls }) => {
      setNodes(ns)
      setLinks(ls)
      // Lay out nodes in a circle initially
      const posMap = new Map<string, NodePos>()
      ns.forEach((n, i) => {
        const angle = (i / ns.length) * 2 * Math.PI
        posMap.set(n.id, {
          id: n.id,
          x: 400 + 180 * Math.cos(angle),
          y: 250 + 140 * Math.sin(angle),
        })
      })
      setPositions(posMap)
    })
  }, [])

  async function handleDiscover() {
    const tab = tabs.find(t => t.id === discoverTab)
    if (!tab?.connId) { setStatus('Selected tab is not connected.'); return }

    // Find or create local node for this device — do NOT update state yet to avoid a race
    // between the pre-discover setNodes and the post-discover setNodes with the full result.
    const existingNode = nodes.find(n => n.sessionId === tab.sessionId)
    const localNode: TopologyNode = existingNode
      ?? { id: uuidv4(), label: tab.sessionName, type: 'unknown', sessionId: tab.sessionId }

    setStatus('Discovering…')
    try {
      const { nodes: newNodes, links: newLinks } = await window.api.topology.lldpDiscover({
        connId: tab.connId,
        connType: tab.sessionType,
        localNodeId: localNode.id,
      })

      // Compute final state in one atomic update to avoid intermediate renders
      const allNodes = [...nodes.filter(n => n.id !== localNode.id), localNode, ...newNodes]
      const allLinks = [...links, ...newLinks]
      setNodes(allNodes)
      setLinks(allLinks)

      // Layout new nodes
      setPositions(prev => {
        const next = new Map(prev)
        if (!next.has(localNode.id)) {
          next.set(localNode.id, { id: localNode.id, x: svgDims.current.w / 2, y: svgDims.current.h / 2 })
        }
        const center = next.get(localNode.id)!
        newNodes.forEach((n, i) => {
          if (!next.has(n.id)) {
            const angle = (i / Math.max(newNodes.length, 1)) * 2 * Math.PI
            next.set(n.id, { id: n.id, x: center.x + 150 * Math.cos(angle), y: center.y + 120 * Math.sin(angle) })
          }
        })
        return next
      })

      setStatus(`Discovered ${newNodes.length} neighbor(s).`)
      // Persist
      await window.api.topology.save({ nodes: allNodes, links: allLinks })
    } catch (e: any) {
      setStatus(`Discovery failed: ${e.message}`)
    }
  }

  async function handleAddNode() {
    const label = prompt('Device name:')
    if (!label) return
    const node: TopologyNode = { id: uuidv4(), label, type: 'unknown' }
    const allNodes = [...nodes, node]
    setNodes(allNodes)
    setPositions(prev => {
      const next = new Map(prev)
      next.set(node.id, { id: node.id, x: svgDims.current.w / 2, y: svgDims.current.h / 2 })
      return next
    })
    await window.api.topology.save({ nodes: allNodes, links })
  }

  async function handleSave() {
    await window.api.topology.save({ nodes, links })
    setStatus('Layout saved.')
    setTimeout(() => setStatus(''), 2000)
  }

  async function handleDeleteNode(id: string) {
    const allNodes = nodes.filter(n => n.id !== id)
    const allLinks = links.filter(l => l.source !== id && l.target !== id)
    setNodes(allNodes)
    setLinks(allLinks)
    setSelected(null)
    await window.api.topology.save({ nodes: allNodes, links: allLinks })
  }

  // Drag handlers
  function onMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation()
    const pos = positions.get(nodeId)!
    dragRef.current = { id: nodeId, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    setSelected(nodeId)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return
    const { id, ox, oy } = dragRef.current
    setPositions(prev => {
      const next = new Map(prev)
      next.set(id, { id, x: e.clientX - ox, y: e.clientY - oy })
      return next
    })
  }

  function onMouseUp() { dragRef.current = null }

  const selectedNode = selected ? nodes.find(n => n.id === selected) : null
  const linkedTab = selectedNode?.sessionId ? tabs.find(t => t.sessionId === selectedNode.sessionId) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '94vw', maxWidth: 1200, height: '90vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Network Topology</span>
          <select
            value={discoverTab}
            onChange={e => setDiscoverTab(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--fg)', padding: '3px 8px', fontSize: 12 }}
          >
            {tabs.filter(t => t.connId).map(t => <option key={t.id} value={t.id}>{t.sessionName}</option>)}
          </select>
          <button onClick={handleDiscover} style={toolBtn('#1f6feb')}>Discover LLDP/CDP</button>
          <button onClick={handleAddNode} style={toolBtn('var(--bg2)')}>+ Add Node</button>
          <button onClick={handleSave} style={toolBtn('#238636')}>Save Layout</button>
          <span style={{ flex: 1 }} />
          {status && <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{status}</span>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--fg)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* SVG canvas */}
          <svg
            ref={svgRef}
            style={{ flex: 1, background: '#0a0f18', cursor: 'default' }}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {/* Links */}
            {links.map(l => {
              const src = positions.get(l.source)
              const tgt = positions.get(l.target)
              if (!src || !tgt) return null
              const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2
              return (
                <g key={l.id}>
                  <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke="#2a3a4a" strokeWidth={2} />
                  {l.label && <text x={mx} y={my} fontSize={9} fill="#4a6a8a" textAnchor="middle">{l.label}</text>}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(n => {
              const pos = positions.get(n.id)
              if (!pos) return null
              const isSelected = n.id === selected
              const color = NODE_COLORS[n.type]
              return (
                <g
                  key={n.id}
                  transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={e => onMouseDown(e, n.id)}
                  style={{ cursor: 'grab', userSelect: 'none' }}
                >
                  <circle r={22} fill={isSelected ? '#1f6feb33' : '#0d1117'} stroke={isSelected ? '#1f6feb' : color} strokeWidth={isSelected ? 2.5 : 1.5} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={16}>{NODE_ICONS[n.type]}</text>
                  <text textAnchor="middle" y={32} fontSize={10} fill={color}>{n.label}</text>
                  {n.host && <text textAnchor="middle" y={44} fontSize={9} fill="#4a6a8a">{n.host}</text>}
                </g>
              )
            })}
          </svg>

          {/* Node detail */}
          {selectedNode && (
            <div style={{ width: 220, borderLeft: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedNode.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Type: {selectedNode.type}</div>
              {selectedNode.host && <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Host: {selectedNode.host}</div>}
              {selectedNode.vendor && <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Vendor: {selectedNode.vendor}</div>}
              {linkedTab && (
                <button
                  onClick={() => onFocusTab?.(linkedTab.id)}
                  style={{ background: '#1f6feb', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
                >
                  Open Session
                </button>
              )}
              <button
                onClick={() => handleDeleteNode(selectedNode.id)}
                style={{ background: '#8b0000', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}
              >
                Remove Node
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function toolBtn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid var(--border)', borderRadius: 4, color: bg === 'var(--bg2)' ? 'var(--fg)' : '#fff', padding: '4px 12px', cursor: 'pointer', fontSize: 12 }
}
