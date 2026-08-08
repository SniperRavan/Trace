/**
 * src/overlay/CompactPanel.tsx
 *
 * Compact floating overlay panel matching Image 1:
 * - Top header with TRACE [FREE] and total tokens today
 * - Dual Session & Weekly progress bars for each provider
 * - Live rolling countdowns (2h 13m, 97h 33m)
 * - Sleek footer with "local-only · privacy first" and "↗ expand" pill
 */

import React, { useState, useEffect } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getSessionPercent,
  getWeeklyPercent,
  getObservedTokens,
  type ProviderId,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'
import { ProviderLogo } from '@/components/ui/ProviderLogo'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini']

function useCountdown(resetAt?: number): string {
  const [text, setText] = useState(() => (resetAt ? formatResetTime(resetAt) : 'dynamic'))
  useEffect(() => {
    if (!resetAt) {
      setText('dynamic')
      return
    }
    const update = () => setText(formatResetTime(resetAt))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [resetAt])
  return text
}

function PanelHeader() {
  const currentTier = useTraceStore(s => s.currentTier)
  const totalObserved = useTraceStore(s =>
    PANEL_PROVIDERS.reduce((sum, id) => sum + getObservedTokens(s.providers[id]), 0)
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px 10px',
        borderBottom: '0.5px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.8px', color: 'rgba(255, 255, 255, 0.65)', textTransform: 'uppercase' }}>
          TRACE
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, padding: '1.5px 5px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' }}>
          {currentTier}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
        <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 500 }}>
          {formatTokens(totalObserved)} today
        </span>
      </div>
    </div>
  )
}

function ProviderRow({ id }: { id: ProviderId }) {
  const state = useTraceStore(s => s.providers[id])
  const { name, color } = PROVIDER_IDENTITY[id]

  const sessionPct = getSessionPercent(state)
  const weeklyPct = getWeeklyPercent(state)

  const sessionWin = state.planPolicy?.windows?.find(w => w.name === 'session')
  const weeklyWin = state.planPolicy?.windows?.find(w => w.name === 'weekly')

  const sessionCountdown = useCountdown(sessionWin?.resetAt ?? state.sessionUsage?.resetAt)
  const weeklyCountdown = useCountdown(weeklyWin?.resetAt ?? state.weeklyUsage?.resetAt)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 16px',
        borderBottom: '0.5px solid rgba(255, 255, 255, 0.03)',
        transition: 'background 0.15s',
      }}
    >
      {/* Line 1: Logo, Name, Model pill, S% and W% */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProviderLogo provider={id} size={20} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>
            {name}
          </span>
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.07)', color: 'rgba(255, 255, 255, 0.45)' }}>
            {state.activeModel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>S:</span>
          <strong style={{ color: '#ffffff', fontWeight: 600 }}>{sessionPct}%</strong>
          <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>·</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>W:</span>
          <strong style={{ color: '#818cf8', fontWeight: 600 }}>{weeklyPct}%</strong>
        </div>
      </div>

      {/* Line 2: Dual Progress Bars with timers below */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 2 }}>
        {/* Session bar */}
        <div>
          <div style={{ height: 3.5, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(sessionPct, sessionPct > 0 ? 3 : 0)}%`,
                background: color,
                borderRadius: 4,
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255, 255, 255, 0.35)', marginTop: 3 }}>
            <span>Session</span>
            <span>{sessionCountdown}</span>
          </div>
        </div>

        {/* Weekly bar */}
        <div>
          <div style={{ height: 3.5, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.max(weeklyPct, weeklyPct > 0 ? 3 : 0)}%`,
                background: '#6366f1',
                borderRadius: 4,
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255, 255, 255, 0.35)', marginTop: 3 }}>
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
    <div
      style={{
        width: 320,
        background: 'var(--trace-bg-gradient, #111319)',
        border: '0.5px solid var(--trace-border-muted, rgba(255, 255, 255, 0.12))',
        borderRadius: 'var(--trace-panel-radius, 18px)',
        backdropFilter: 'var(--trace-panel-blur, blur(28px))',
        WebkitBackdropFilter: 'var(--trace-panel-blur, blur(28px))',
        boxShadow: 'var(--trace-panel-shadow, 0 16px 48px rgba(0, 0, 0, 0.6))',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: 'var(--trace-text-primary, #ffffff)',
        animation: 'trace-slide-up 0.18s ease-out',
      }}
    >
      <PanelHeader />

      <div>
        {PANEL_PROVIDERS.map(id => (
          <ProviderRow key={id} id={id} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 16px',
          background: 'rgba(0, 0, 0, 0.18)',
          borderTop: '0.5px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', fontWeight: 400 }}>
          local-only · privacy first
        </span>
        <button
          onClick={() => setExpandedView(true, useTraceStore.getState().activeProvider || 'chatgpt')}
          style={{
            fontSize: 10,
            padding: '3px 10px',
            borderRadius: 9999,
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.06) 100%)',
            color: '#ffffff',
            border: '0.5px solid rgba(255, 255, 255, 0.28)',
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.35)',
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'all 0.15s',
          }}
        >
          ↗ expand
        </button>
      </div>
    </div>
  )
}
