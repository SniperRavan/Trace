/**
 * src/components/ui/CustomDropdown.tsx
 *
 * Glassmorphism custom dropdown menu with direction control ('up' | 'down') and robust Shadow DOM click handling.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'

export interface DropdownOption<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

interface CustomDropdownProps<T extends string> {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  label?: string
  icon?: ReactNode
  width?: number | string
  direction?: 'up' | 'down'
}

export function CustomDropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  width = '100%',
  direction = 'down',
}: CustomDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value) || options[0]

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      const path = e.composedPath ? e.composedPath() : []
      const isInside =
        containerRef.current &&
        (containerRef.current.contains(e.target as Node) || path.includes(containerRef.current))
      if (!isInside) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (id: T, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange(id)
    setOpen(false)
  }

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    background: 'rgba(15, 18, 26, 0.98)',
    border: '0.5px solid rgba(255,255,255,0.25)',
    borderRadius: 10,
    padding: '4px',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.2)',
    maxHeight: 170,
    overflowY: 'auto',
    ...(direction === 'up'
      ? { bottom: 'calc(100% + 4px)', top: 'auto' }
      : { top: 'calc(100% + 4px)', bottom: 'auto' }),
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width }}>
      {label && (
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600 }}>
          {label}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(v => !v)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)',
          border: '0.5px solid rgba(255,255,255,0.22)',
          borderRadius: 8,
          color: '#ffffff',
          fontSize: 11,
          padding: '6px 10px',
          cursor: 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25)',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {icon || selected?.icon}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected?.label}
          </span>
        </div>
        <span style={{ fontSize: 9, opacity: 0.5, transform: open ? (direction === 'up' ? 'none' : 'rotate(180deg)') : (direction === 'up' ? 'rotate(180deg)' : 'none'), transition: 'transform 0.15s' }}>
          ▲
        </span>
      </button>

      {open && (
        <div style={menuStyle}>
          {options.map(opt => {
            const isSelected = opt.id === value
            return (
              <div
                key={opt.id}
                onMouseDown={(e) => handleSelect(opt.id, e)}
                onClick={(e) => handleSelect(opt.id, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.75)',
                  background: isSelected ? 'rgba(255,255,255,0.14)' : 'transparent',
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'background 0.12s',
                  userSelect: 'none',
                }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
              >
                {opt.icon && <span style={{ display: 'flex', alignItems: 'center' }}>{opt.icon}</span>}
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isSelected && <span style={{ fontSize: 10, color: '#34d399' }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
