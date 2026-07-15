/**
 * src/overlay/CompactPanel.tsx
 */

import { useState, useEffect } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getSessionPercent,
  type ProviderId,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity']

function useCountdown(resetAt: number): string {
  const [text, setText] = useState(() => formatResetTime(resetAt))
  useEffect(() => {
    const update = () => setText(formatResetTime(resetAt))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [resetAt])
  return text
}

function ProviderIcon({ id, size = 26 }: { id: ProviderId; size?: number }) {
  const { letter, color } = PROVIDER_IDENTITY[id]
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.33),
      background: `${color}20`,
      border: `1px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.45, fontWeight: 600, color, lineHeight: 1 }}>{letter}</span>
    </div>
  )
}

function PanelHeader() {
  const total = useTraceStore(s =>
    PANEL_PROVIDERS.reduce((sum, id) => sum + s.providers[id].totalTokens, 0)
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px 9px',
      borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
        Trace
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'trace-breathe 2s ease-in-out infinite' }} />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{formatTokens(total)} today</span>
      </div>
    </div>
  )
}

function ProviderRow({ id }: { id: ProviderId }) {
  const state = useTraceStore(s => s.providers[id])
  const { name, color } = PROVIDER_IDENTITY[id]
  const rawPct = getSessionPercent(state)
  const used = state.sessionUsage.used
  const pct = rawPct
  const showSliver = used > 0 && rawPct === 0
  const barPct = showSliver ? 0.6 : rawPct
  const label = showSliver ? '<1%' : `${rawPct}%`
  const barColor = pct >= 80 ? 'rgba(248,113,113,0.9)' : color
  const pctColor = pct >= 80 ? '#f87171' : 'rgba(255,255,255,0.55)'
  const countdown = useCountdown(state.sessionUsage.resetAt)

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', transition: 'background 0.15s', cursor: 'default' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <ProviderIcon id={id} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>{name}</div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 3, background: barColor, boxShadow: `0 0 6px ${barColor}55`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: pctColor, fontVariantNumeric: 'tabular-nums' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>{countdown}</span>
      </div>
    </div>
  )
}

export function CompactPanel() {
  const setExpandedView = useTraceStore(s => s.setExpandedView)
  return (
    <div style={{
      width: 264,
      background: 'rgba(14,16,22,0.97)',
      border: '0.5px solid rgba(255,255,255,0.09)',
      borderRadius: 16,
      backdropFilter: 'blur(32px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      animation: 'trace-slide-up 0.18s ease-out',
    }}>
      <PanelHeader />
      <div style={{ padding: '6px 0' }}>
        {PANEL_PROVIDERS.map(id => <ProviderRow key={id} id={id} />)}
      </div>
      <div style={{
        padding: '7px 14px 9px',
        borderTop: '0.5px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>all providers · local estimate · no cloud</span>
        <span
          onClick={() => setExpandedView(true)}
          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: 'rgba(129,140,248,0.7)', border: '0.5px solid rgba(99,102,241,0.18)', cursor: 'pointer' }}
        >
          ↗ expand
        </span>
      </div>
    </div>
  )
}
