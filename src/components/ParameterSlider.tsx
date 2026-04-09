import React, { useState, useRef, useEffect } from 'react'

interface ParameterSliderProps {
  value: number
  min: number
  max: number
  step?: number
  snapToCenter?: boolean
  snapRange?: number
  centerValue?: number
  onChange: (value: number) => void
  formatDisplay?: (value: number) => string
  className?: string
  title?: string
}

export function ParameterSlider({
  value,
  min,
  max,
  step = 1,
  snapToCenter = false,
  snapRange = 0.05,
  centerValue = 0,
  onChange,
  formatDisplay,
  className = '',
  title = ''
}: ParameterSliderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = parseFloat(e.target.value)
    
    // Snap to center if enabled and within snap range
    if (snapToCenter && Math.abs(newValue - centerValue) <= snapRange) {
      newValue = centerValue
    }
    
    onChange(newValue)
  }

  const handleDoubleClick = () => {
    setEditValue(value.toString())
    setIsEditing(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const parsed = parseFloat(editValue)
      if (!isNaN(parsed)) {
        const clamped = Math.max(min, Math.min(max, parsed))
        onChange(clamped)
      }
      setIsEditing(false)
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  const handleInputBlur = () => {
    const parsed = parseFloat(editValue)
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed))
      onChange(clamped)
    }
    setIsEditing(false)
  }

  const displayValue = formatDisplay ? formatDisplay(value) : value.toFixed(2)

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        onBlur={handleInputBlur}
        className={`parameter-slider-input ${className}`}
        style={{
          width: '60px',
          padding: '2px 4px',
          fontSize: '11px',
          border: '1px solid var(--purple)',
          background: 'var(--bg-1)',
          color: 'var(--text-h)',
          borderRadius: '2px',
          textAlign: 'center'
        }}
      />
    )
  }

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleSliderChange}
      onDoubleClick={handleDoubleClick}
      className={className}
      title={title || displayValue}
      style={{ cursor: 'pointer' }}
    />
  )
}
