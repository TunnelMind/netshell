import React, { useState, useRef, useCallback } from 'react'

interface Props {
  direction: 'horizontal' | 'vertical'
  first: React.ReactNode
  second: React.ReactNode
  initialSplit?: number // 0–1, default 0.5
}

export default function SplitPane({ direction, first, second, initialSplit = 0.5 }: Props) {
  const [split, setSplit] = useState(initialSplit)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const ratio = direction === 'horizontal'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
      setSplit(Math.max(0.15, Math.min(0.85, ratio)))
    }

    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [direction])

  const isH = direction === 'horizontal'
  const pct = `${split * 100}%`

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: isH ? 'row' : 'column', width: '100%', height: '100%' }}
    >
      <div style={{ [isH ? 'width' : 'height']: pct, overflow: 'hidden', flexShrink: 0 }}>
        {first}
      </div>

      {/* Divider */}
      <div
        onMouseDown={onMouseDown}
        style={{
          [isH ? 'width' : 'height']: 4,
          [isH ? 'cursor' : 'cursor']: isH ? 'col-resize' : 'row-resize',
          background: 'var(--border)',
          flexShrink: 0,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--border)'}
      />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {second}
      </div>
    </div>
  )
}
