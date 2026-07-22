/**
 * src/overlay/CompactPanel.tsx
 */

import { useState, useEffect } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getSessionPercent,
  getWeeklyPercent,
  type ProviderId,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'
import { ProviderLogo } from '@/components/ui/ProviderLogo'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'deepseek', 'meta']

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

function PanelHeader() {
  const currentTier = useTraceStore(s => s.currentTier)
  const total = useTraceStore(s =>
    PANEL_PROVIDERS.reduce((sum, id) => sum + s.providers[id].totalTokens, 0)
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px 9px',
      borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
          Trace
        </span>
        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {currentTier}
        </span>
      </div>
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
  const sessionPct = getSessionPercent(state)
  const weeklyPct = getWeeklyPercent(state)

  const sessionBarColor = sessionPct >= 80 ? 'rgba(248,113,113,0.9)' : color
  const weeklyBarColor = weeklyPct >= 80 ? 'rgba(239,68,68,0.9)' : 'rgba(99,102,241,0.85)'
  const countdown = useCountdown(state.sessionUsage.resetAt)
  const weeklyCountdown = useCountdown(state.weeklyUsage.resetAt)

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 14px', transition: 'background 0.15s', cursor: 'default' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProviderLogo provider={id} size={22} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--trace-text-primary, rgba(255,255,255,0.85))' }}>{name}</span>
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
            {state.activeModel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
          <span>S: <strong style={{ color: sessionPct >= 80 ? '#f87171' : '#ffffff' }}>{sessionPct}%</strong></span>
          <span>·</span>
          <span>W: <strong style={{ color: weeklyPct >= 80 ? '#f87171' : 'rgba(129,140,248,0.9)' }}>{weeklyPct}%</strong></span>
        </div>
      </div>

      {/* Dual Progress Bars: Session & Weekly */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
        <div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(sessionPct, 1)}%`, borderRadius: 3, background: sessionBarColor, transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span>Session</span>
            <span>{countdown}</span>
          </div>
        </div>
        <div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(weeklyPct, 1)}%`, borderRadius: 3, background: weeklyBarColor, transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span>Weekly</span>
            <span>{weeklyCountdown}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CompactPanel() {
  const setExpandedView = useTraceStore(s => s.setExpandedView)
  return (
    <div style={{
      width: 264,
      background: 'var(--trace-bg-base, #0d0f14)',
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
