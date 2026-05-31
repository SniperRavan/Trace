/**
 * src/overlay/OverlayApp.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTraceStore } from '@/storage/store'
import { CompactPanel } from './CompactPanel'
import type { ProviderId } from '@/providers/logos'

interface OverlayAppProps {
  provider: ProviderId
  shadowRoot: ShadowRoot
}

export function OverlayApp({ provider }: OverlayAppProps) {
  const { setActiveProvider, activeProvider } = useTraceStore()
  useEffect(() => {
    if (activeProvider !== provider) setActiveProvider(provider)
  }, [activeProvider, provider, setActiveProvider])
  return <TraceBubble />
}

function TraceBubble() {
  const { overlayOpen, toggleOverlay } = useTraceStore()

  const [pos, setPos] = useState({ x: window.innerWidth - 80, y: 16 })
  const [hidden, setHidden] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [dragging, setDragging] = useState(false)

  const dragOffset = useRef({ x: 0, y: 0 })
  const didDrag = useRef(false)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rightClickPending = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    didDrag.current = false
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setDragging(true)
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      didDrag.current = true
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    rightClickPending.current = true
    if (overlayOpen) toggleOverlay()
    setShowMenu(v => !v)
  }, [overlayOpen, toggleOverlay])

  // Close menu on outside click — ignore right-clicks (button === 2)
  // and ignore clicks that land inside the menu itself
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (e.button === 2) return
      if (rightClickPending.current) {
        rightClickPending.current = false
        return
      }
      if (menuRef.current?.contains(e.target as Node)) return
      setShowMenu(false)
    }
    // Use mouseup so MenuItem onClick fires first
    window.addEventListener('mouseup', handler, true)
    return () => window.removeEventListener('mouseup', handler, true)
  }, [showMenu])

  const onClick = useCallback(() => {
    if (didDrag.current) return
    setShowMenu(false)
    toggleOverlay()
  }, [toggleOverlay])

  const panelLeft = Math.min(pos.x, window.innerWidth - 280)
  const panelTop = pos.y + 62

  if (hidden) return null

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483647 }}>
      <div
        ref={bubbleRef}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={{
          position: 'absolute', left: pos.x, top: pos.y,
          width: 52, height: 52, borderRadius: 16,
          background: 'rgba(20,23,32,0.92)',
          border: '0.5px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: dragging ? 'grabbing' : 'grab',
          pointerEvents: 'auto', userSelect: 'none',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04)',
          transition: dragging ? 'none' : 'box-shadow 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', inset: -4, borderRadius: 20,
          border: '1.5px solid rgba(99,102,241,0.4)',
          animation: 'trace-pulse-ring 2.5s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -3, right: -3,
          width: 10, height: 10, borderRadius: '50%',
          background: '#10b981', border: '2px solid #0d0f14',
          animation: 'trace-breathe 2s ease-in-out infinite',
        }} />
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="9" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />
          <path d="M7 11.5 Q9 8 11 11 Q13 14 15 10.5" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx="11" cy="11" r="1.8" fill="rgba(245,158,11,0.2)" stroke="rgba(245,158,11,0.6)" strokeWidth="0.8" />
        </svg>
      </div>

      {overlayOpen && (
        <div style={{ position: 'absolute', left: panelLeft, top: panelTop, pointerEvents: 'auto' }}>
          <CompactPanel />
        </div>
      )}

      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute', left: pos.x, top: pos.y + 58,
            background: 'rgba(14,16,22,0.97)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 10, backdropFilter: 'blur(20px)',
            padding: '4px', minWidth: 148, pointerEvents: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            animation: 'trace-slide-up 0.15s ease-out',
          }}
        >
          <MenuItem label={overlayOpen ? 'Close panel' : 'Open panel'} icon="↗"
            onClick={() => { toggleOverlay(); setShowMenu(false) }} />
          <MenuItem label="Snap to corner" icon="◎"
            onClick={() => { setPos({ x: window.innerWidth - 80, y: 16 }); setShowMenu(false) }} />
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <MenuItem label="Hide Trace" icon="✕" danger
            onClick={() => { setHidden(true); setShowMenu(false) }} />
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger = false }: {
  icon: string; label: string; onClick: () => void; danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
      onMouseUp={e => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 0.15s',
        color: danger
          ? (hovered ? '#f87171' : 'rgba(248,113,113,0.7)')
          : 'rgba(255,255,255,0.65)',
        fontSize: 12, userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 11, opacity: 0.7, width: 14, textAlign: 'center' }}>{icon}</span>
      {label}
    </div>
  )
}
