/**
 * src/overlay/ExpandedPanel.tsx
 *
 * Trace 2-Column Detailed Observability Dashboard.
 * Matches authentic Linux terminal rice / Liquid Glass aesthetics:
 * - Left Sidebar: Providers list, percentages, Plan Tier dropdown, Theme selector
 * - Right Area: Detailed Usage header, 3 Metric Cards, Glowing Wave Chart, Export/Import
 */

import React, { useState, useEffect, useRef } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getContextPercent,
  getSessionPercent,
  getWeeklyPercent,
  getObservedTokens,
  getQuotaDisplay,
  getHealthState,
  exportDataAsJSON,
  exportDataAsCSV,
  type ProviderId,
  type ThemeName,
  type SubscriptionTier,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'
import { ProviderLogo } from '@/components/ui/ProviderLogo'
import { CustomDropdown } from '@/components/ui/CustomDropdown'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini']

const THEMES: { id: ThemeName; label: string; icon: string }[] = [
  { id: 'catppuccin', label: 'Catppuccin', icon: '🎨' },
  { id: 'nord', label: 'Nord', icon: '❄️' },
  { id: 'tokyonight', label: 'Tokyo Night', icon: '🌃' },
  { id: 'gruvbox', label: 'Gruvbox', icon: '📜' },
  { id: 'dracula', label: 'Dracula', icon: '🧛' },
  { id: 'everforest', label: 'Everforest', icon: '🌲' },
  { id: 'liquidglass', label: 'Liquid Glass', icon: '🌊' },
]

const TIERS: { id: SubscriptionTier; label: string; icon: string }[] = [
  { id: 'free', label: 'Free Plan', icon: '🌱' },
  { id: 'pro', label: 'Pro / Plus', icon: '⚡' },
  { id: 'team', label: 'Team Plan', icon: '👥' },
  { id: 'enterprise', label: 'Enterprise', icon: '🏛️' },
]

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

function GlowingAreaChart({ history, color, width = 420, height = 120 }: {
  history: { observedTokens: number }[]; color: string; width?: number; height?: number
}) {
  // Generate a mock baseline wave if no history yet so the chart is gorgeous
  const data = history.length >= 2 
    ? history 
    : [
        { observedTokens: 200 },
        { observedTokens: 800 },
        { observedTokens: 1400 },
        { observedTokens: 1400 },
        { observedTokens: 2200 },
        { observedTokens: 3100 },
        { observedTokens: 3100 },
      ]

  const maxVal = Math.max(10, ...data.map(d => d.observedTokens))
  const pointsCount = data.length

  const coords = data.map((pt, i) => {
    const x = (i / (pointsCount - 1)) * width
    const y = height - (pt.observedTokens / maxVal) * (height * 0.75) - 10
    return { x, y }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#gradient-${color})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill={color} stroke="#0d0f14" strokeWidth="2" />
      )}
    </svg>
  )
}

export function ExpandedPanel() {
  const store = useTraceStore()
  const activeId = store.expandedProvider || store.activeProvider || 'chatgpt'
  const state = store.providers[activeId] || store.providers.chatgpt
  const { name, color } = PROVIDER_IDENTITY[state.id]

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const observedTokens = getObservedTokens(state)
  const sessionPct = getSessionPercent(state)
  const quota = getQuotaDisplay(state)
  const countdown = useCountdown(quota.resetAt)

  const isServerExact = state.lastRecord?.source === 'server' && state.lastRecord?.confidence === 'exact'
  const totalCombined = PANEL_PROVIDERS.reduce((sum, id) => sum + getObservedTokens(store.providers[id]), 0)

  const handleExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? exportDataAsJSON(store.providers) : exportDataAsCSV(store.providers)
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-backup-${new Date().toISOString().slice(0, 10)}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      const res = store.importDataFromJSON(content)
      if (res.success) {
        setImportStatus(`Imported ${res.importedCount} providers!`)
      } else {
        setImportStatus(`Import failed: ${res.error}`)
      }
      setTimeout(() => setImportStatus(null), 4000)
    }
    reader.readAsText(file)
  }

  return (
    <div
      data-theme={store.currentTheme}
      style={{
        width: 700,
        minHeight: 440,
        background: 'var(--trace-bg-gradient, #111319)',
        border: '0.5px solid var(--trace-border-muted, rgba(255,255,255,0.12))',
        borderRadius: 'var(--trace-panel-radius, 20px)',
        backdropFilter: 'var(--trace-panel-blur, blur(28px))',
        WebkitBackdropFilter: 'var(--trace-panel-blur, blur(28px))',
        boxShadow: 'var(--trace-panel-shadow, 0 20px 64px rgba(0,0,0,0.65))',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: 'var(--trace-text-primary, #ffffff)',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        animation: 'trace-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ── Left Sidebar (220px) ────────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.22)',
          borderRight: '0.5px solid rgba(255, 255, 255, 0.07)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 16px 12px',
              borderBottom: '0.5px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>
              PROVIDERS
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
              {formatTokens(totalCombined)} combined
            </span>
          </div>

          {/* Provider List */}
          <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PANEL_PROVIDERS.map(pId => {
              const p = store.providers[pId]
              const isSelected = pId === activeId
              const pct = getSessionPercent(p)
              return (
                <div
                  key={pId}
                  onClick={() => store.setExpandedView(true, pId)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: isSelected ? '0.5px solid rgba(255, 255, 255, 0.16)' : '0.5px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ProviderLogo provider={pId} size={22} />
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500, color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)' }}>
                      {PROVIDER_IDENTITY[pId].name}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dropdowns Bottom */}
        <div style={{ padding: '16px', borderTop: '0.5px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, fontWeight: 600 }}>
              {name.toUpperCase()} PLAN TIER
            </div>
            <CustomDropdown
              label=""
              value={state.tier}
              options={TIERS}
              onChange={val => store.setProviderTier(state.id, val as SubscriptionTier)}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, fontWeight: 600 }}>
              THEME
            </div>
            <CustomDropdown
              label=""
              value={store.currentTheme}
              options={THEMES}
              onChange={val => store.setTheme(val as ThemeName)}
            />
          </div>
        </div>
      </div>

      {/* ── Right Content Area ───────────────────────────────────────────── */}
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ProviderLogo provider={state.id} size={30} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', color: '#ffffff' }}>
                {name} Detailed Usage
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Model: <strong style={{ color: '#34d399' }}>{state.activeModel}</strong></span>
                <span>·</span>
                <span>Tier: <strong style={{ textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>{state.tier}</strong></span>
                {isServerExact && (
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                    exact
                  </span>
                )}
                {state.adapterHealth?.status === 'needs_review' && (
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,0.18)', color: '#f87171' }}>
                    drift
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => store.toggleProviderEnabled(state.id)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: state.enabled ? '0.5px solid rgba(16,185,129,0.35)' : '0.5px solid rgba(239,68,68,0.35)',
                background: state.enabled ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: state.enabled ? '#34d399' : '#f87171',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {state.enabled ? 'Active' : 'Paused'}
            </button>
            <button
              onClick={() => store.setExpandedView(false)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                border: '0.5px solid rgba(255, 255, 255, 0.15)',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              ← back
            </button>
          </div>
        </div>

        {/* Protocol drift warning if active */}
        {state.adapterHealth?.status === 'needs_review' && (
          <div style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 10, color: '#f87171' }}>
            ⚠️ Protocol drift detected ({state.adapterHealth.lastFailureReason || 'Schema change'}). Falling back to safe local estimates.
          </div>
        )}

        {/* 3 Metric Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {/* Card 1: Total Tokens */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '0.5px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Total Tokens</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#ffffff' }}>
              {formatTokens(observedTokens)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              in: {formatTokens(state.inputTokens)} · out: {formatTokens(state.outputTokens)}
            </div>
          </div>

          {/* Card 2: Session Usage */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '0.5px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Session Usage</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', color: '#ffffff' }}>
              {sessionPct}%
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {quota.isExact ? `${formatTokens(Math.max(0, 40000 - state.sessionUsage.used))} remaining` : `Reset in ${countdown}`}
            </div>
          </div>

          {/* Card 3: Context & Cache */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '0.5px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>Context & Cache</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', color: '#ffffff', marginTop: 3 }}>
              {formatTokens(state.contextTokens)} / {formatTokens(state.contextLimit)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>
              Cache: {state.cachedInputTokens > 0 ? `${formatTokens(state.cachedInputTokens)} cached` : 'Inactive'}
            </div>
          </div>
        </div>

        {/* ── Usage History Chart Area ─────────────────────────────────────── */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.20)',
          border: '0.5px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 14,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              USAGE HISTORY (50M WINDOW)
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#34d399' }}>
              Session Limit: {formatTokens(state.sessionUsage.total || 40000)}
            </span>
          </div>

          <GlowingAreaChart history={state.history} color={color} width={420} height={120} />
        </div>

        {/* ── Scope & Local Backup Footer ───────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 4,
          borderTop: '0.5px solid rgba(255, 255, 255, 0.06)',
        }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
            Scope: <strong style={{ color: 'rgba(255,255,255,0.65)' }}>This browser profile only</strong> (zero telemetry).
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
            <button
              onClick={() => handleExport('json')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '0.5px solid rgba(255, 255, 255, 0.12)',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '0.5px solid rgba(255, 255, 255, 0.12)',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 10,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Import JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
