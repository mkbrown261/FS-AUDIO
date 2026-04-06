import React, { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  shortcut?: string
  action: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean  // if true, render a divider line instead
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Adjust position to stay in viewport
    const el = ref.current
    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.right > window.innerWidth) el.style.left = (x - rect.width) + 'px'
      if (rect.bottom > window.innerHeight) el.style.top = (y - rect.height) + 'px'
    }
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [x, y, onClose])

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      {items.map((item, i) => item.separator ? (
        <div key={i} className="ctx-sep" />
      ) : (
        <div
          key={i}
          className={`ctx-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
          onClick={() => { if (!item.disabled) { item.action(); onClose() } }}
        >
          <span className="ctx-label">{item.label}</span>
          {item.shortcut && <span className="ctx-shortcut">{item.shortcut}</span>}
        </div>
      ))}
    </div>
  )
}
