/**
 * FS-AUDIO — Floating Plugin Window
 * Draggable, resizable, collapsible plugin editor window.
 * Features:
 *  • Drag header to move
 *  • 8-direction resize handles
 *  • Double-click header to collapse/expand
 *  • Snap-to-edge (magnetic to screen borders)
 *  • Keyboard: Escape to close
 *  • z-index lift on click
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'

interface FloatingPluginWindowProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  initialX?: number
  initialY?: number
  width?: number
  height?: number
  pluginColor?: string
}

const MIN_W = 320
const MIN_H = 200
const SNAP_THRESHOLD = 16

export function FloatingPluginWindow({
  title,
  children,
  onClose,
  initialX = 120,
  initialY = 80,
  width: initW = 560,
  height: initH = 480,
  pluginColor = '#a855f7',
}: FloatingPluginWindowProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const [size, setSize] = useState({ w: initW, h: initH })
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [zIdx, setZIdx] = useState(1000)
  const windowRef = useRef<HTMLDivElement>(null)
  const dragOffRef = useRef({ x: 0, y: 0 })
  const resizeRef = useRef<{ dir: string; startX: number; startY: number; startW: number; startH: number; startPX: number; startPY: number } | null>(null)

  // Global z-index counter
  const bringToFront = useCallback(() => {
    setZIdx(z => z < 9999 ? z + 1 : z)
  }, [])

  // ── Dragging ──────────────────────────────────────────────────────────────
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    bringToFront()
    dragOffRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setDragging(true)
  }, [pos, bringToFront])

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => {
      let nx = e.clientX - dragOffRef.current.x
      let ny = e.clientY - dragOffRef.current.y
      // Snap to viewport edges
      const vw = window.innerWidth; const vh = window.innerHeight
      if (nx < SNAP_THRESHOLD) nx = 0
      if (ny < SNAP_THRESHOLD) ny = 44 // below toolbar
      if (nx + size.w > vw - SNAP_THRESHOLD) nx = vw - size.w
      if (ny + size.h > vh - SNAP_THRESHOLD) ny = vh - size.h
      setPos({ x: Math.max(0, nx), y: Math.max(44, ny) })
    }
    const up = () => setDragging(false)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up) }
  }, [dragging, size])

  // ── Resize ────────────────────────────────────────────────────────────────
  const startResize = useCallback((e: React.MouseEvent, dir: string) => {
    e.preventDefault(); e.stopPropagation()
    bringToFront()
    resizeRef.current = { dir, startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h, startPX: pos.x, startPY: pos.y }

    const move = (ev: MouseEvent) => {
      const r = resizeRef.current; if (!r) return
      const dx = ev.clientX - r.startX; const dy = ev.clientY - r.startY
      let nw = r.startW; let nh = r.startH; let nx = r.startPX; let ny = r.startPY
      if (r.dir.includes('e')) nw = Math.max(MIN_W, r.startW + dx)
      if (r.dir.includes('s')) nh = Math.max(MIN_H, r.startH + dy)
      if (r.dir.includes('w')) { nw = Math.max(MIN_W, r.startW - dx); nx = r.startPX + (r.startW - nw) }
      if (r.dir.includes('n')) { nh = Math.max(MIN_H, r.startH - dy); ny = r.startPY + (r.startH - nh) }
      setSize({ w: nw, h: nh }); setPos({ x: nx, y: ny })
    }
    const up = () => { resizeRef.current = null }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up, { once: true })
    document.addEventListener('mouseup', () => { document.removeEventListener('mousemove', move) }, { once: true })
  }, [size, pos, bringToFront])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const colorRgb = pluginColor.replace('#', '')
  const r = parseInt(colorRgb.slice(0, 2), 16)
  const g = parseInt(colorRgb.slice(2, 4), 16)
  const b = parseInt(colorRgb.slice(4, 6), 16)

  const handleH = 36
  const totalH = collapsed ? handleH : size.h

  return (
    <div
      ref={windowRef}
      onMouseDown={bringToFront}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: totalH,
        zIndex: zIdx,
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(160deg, rgba(${r},${g},${b},0.08) 0%, #0a0a16 20%)`,
        border: `1px solid rgba(${r},${g},${b},0.35)`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(${r},${g},${b},0.12), 0 0 30px rgba(${r},${g},${b},0.06)`,
        transition: dragging ? 'none' : 'box-shadow 0.2s',
        userSelect: 'none',
      }}
    >
      {/* ── Header ── */}
      <div
        className="plugin-window-header"
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={() => setCollapsed(c => !c)}
        style={{
          height: handleH,
          flexShrink: 0,
          padding: '0 10px',
          background: `linear-gradient(135deg, rgba(${r},${g},${b},0.28) 0%, rgba(${r},${g},${b},0.12) 100%)`,
          borderBottom: collapsed ? 'none' : `1px solid rgba(${r},${g},${b},0.2)`,
          cursor: dragging ? 'grabbing' : 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Color dot */}
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: pluginColor,
          boxShadow: `0 0 6px ${pluginColor}`,
          flexShrink: 0,
        }} />

        {/* Title */}
        <span style={{ flex: 1, fontWeight: 800, fontSize: 11, color: '#f0f0f0', letterSpacing: '0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>

        {/* Collapse button */}
        <button
          onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, width: 22, height: 22, cursor: 'pointer', color: '#9ca3af',
            fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLElement).style.color = '#e2e8f0' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af' }}
        >{collapsed ? '▼' : '▲'}</button>

        {/* Close button */}
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          title="Close (Esc)"
          style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 4, width: 22, height: 22, cursor: 'pointer', color: '#f87171',
            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.3)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.5)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)' }}
        >✕</button>
      </div>

      {/* ── Content ── */}
      {!collapsed && (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 0,
            userSelect: 'none',
            // Custom scrollbar
            scrollbarWidth: 'thin',
            scrollbarColor: `rgba(${r},${g},${b},0.3) transparent`,
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {children}
        </div>
      )}

      {/* ── Resize handles (8 directions) ── */}
      {!collapsed && (
        <>
          {/* Corners */}
          {(['nw','ne','sw','se'] as const).map(dir => (
            <div
              key={dir}
              onMouseDown={e => startResize(e, dir)}
              style={{
                position: 'absolute',
                width: 12, height: 12,
                cursor: `${dir}-resize`,
                ...(dir === 'nw' ? { top: 0, left: 0 } : {}),
                ...(dir === 'ne' ? { top: 0, right: 0 } : {}),
                ...(dir === 'sw' ? { bottom: 0, left: 0 } : {}),
                ...(dir === 'se' ? { bottom: 0, right: 0 } : {}),
                zIndex: 10,
              }}
            />
          ))}
          {/* Edges */}
          <div onMouseDown={e => startResize(e, 'n')} style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 4, cursor: 'n-resize', zIndex: 10 }} />
          <div onMouseDown={e => startResize(e, 's')} style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 4, cursor: 's-resize', zIndex: 10 }} />
          <div onMouseDown={e => startResize(e, 'w')} style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, cursor: 'w-resize', zIndex: 10 }} />
          <div onMouseDown={e => startResize(e, 'e')} style={{ position: 'absolute', right: 0, top: 12, bottom: 12, width: 4, cursor: 'e-resize', zIndex: 10 }} />
          {/* SE resize corner visual indicator */}
          <div style={{
            position: 'absolute', bottom: 3, right: 3, width: 10, height: 10,
            pointerEvents: 'none',
            borderRight: `2px solid rgba(${r},${g},${b},0.4)`,
            borderBottom: `2px solid rgba(${r},${g},${b},0.4)`,
            borderRadius: '0 0 3px 0',
          }} />
        </>
      )}
    </div>
  )
}
