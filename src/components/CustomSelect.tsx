import React, { useState, useRef, useEffect } from 'react'

interface Option { value: string; label: string }
interface CustomSelectProps {
  value: string
  options: Option[]
  onChange: (v: string) => void
  width?: number
  disabled?: boolean
  className?: string
}

export function CustomSelect({ value, options, onChange, width = 100, disabled, className }: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = options.find(o => o.value === value)?.label ?? value

  return (
    <div
      ref={ref}
      className={`cs-wrap ${className ?? ''} ${open ? 'cs-open' : ''} ${disabled ? 'cs-disabled' : ''}`}
      style={{ width }}
    >
      <div className="cs-trigger" onClick={() => !disabled && setOpen(o => !o)}>
        <span className="cs-value">{current}</span>
        <svg className="cs-chevron" width="8" height="5" viewBox="0 0 8 5">
          <path d="M0 0 L4 5 L8 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div className="cs-dropdown">
          {options.map(o => (
            <div
              key={o.value}
              className={`cs-option ${o.value === value ? 'cs-selected' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
