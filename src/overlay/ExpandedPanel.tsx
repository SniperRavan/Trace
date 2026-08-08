/**
 * src/overlay/ExpandedPanel.tsx
 *
 * Expanded HUD Dashboard.
 * Presents four distinct observability cards:
 * 1. Observed Tokens (Server Exact vs Local Estimate breakdown)
 * 2. Context Window Load (Conversation tokens vs Model context limit)
 * 3. Plan & Quota Status (Dynamic compute/message allowance + countdown)
 * 4. Coverage Scope & Local Backup (Local profile banner + JSON export/import)
 */

import { useState, useEffect, useRef } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getContextPercent,
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

function SparklineChart({ history, color, width = 310, height = 90 }: {
  history: { observedTokens: number }[]; color: string; width?: number; height?: number
}) {
  if (history.length === 0) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.01)',
        borderRadius: 10,
        border: '0.5px dashed rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No observed requests yet</span>
      </div>
    )
  }

  const data = history.length === 1 ? [history[0], history[0]] : history
  const maxVal = Math.max(1, ...data.map(d => d.observedTokens))
  const pointsCount = data.length

  const coords = data.map((pt, i) => {
    const x = (i / (pointsCount - 1)) * width
    const y = height - (pt.observedTokens / maxVal) * height * 0.75 - 10
    return { x, y }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.00" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#gradient-${color})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.5" fill={color} stroke="#0d0f14" strokeWidth="1.5" />
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
  const contextPct = getContextPercent(state)
  const health = getHealthState(state.contextTokens || 0, state.contextLimit || 128_000)
  const quota = getQuotaDisplay(state)
  const countdown = useCountdown(quota.resetAt)

  const isServerExact = state.lastRecord?.source === 'server' && state.lastRecord?.confidence === 'exact'

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
    <div style={{
      width: 350,
      background: 'var(--trace-bg-gradient, #0d0f14)',
      border: '0.5px solid var(--trace-border-muted, rgba(255,255,255,0.12))',
      borderRadius: 'var(--trace-panel-radius, 16px)',
      backdropFilter: 'var(--trace-panel-blur, blur(20px))',
      WebkitBackdropFilter: 'var(--trace-panel-blur, blur(20px))',
      boxShadow: 'var(--trace-panel-shadow, 0 12px 48px rgba(0,0,0,0.65))',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#ffffff',
      overflow: 'hidden',
      animation: 'trace-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '0.5px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProviderLogo provider={state.id} size={24} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{state.activeModel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => store.toggleProviderEnabled(state.id)}
            style={{
              padding: '3px 7px',
              borderRadius: 4,
              border: state.enabled ? '0.5px solid rgba(16,185,129,0.35)' : '0.5px solid rgba(239,68,68,0.35)',
              background: state.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              color: state.enabled ? '#34d399' : '#f87171',
              fontSize: 9,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {state.enabled ? 'Active' : 'Paused'}
          </button>
          <button
            onClick={() => store.setExpandedView(false)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: 10,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Provider Selector Tabs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
        padding: '8px 16px',
        background: 'rgba(0,0,0,0.2)',
      }}>
        {PANEL_PROVIDERS.map(pId => (
          <button
            key={pId}
            onClick={() => store.setExpandedView(true, pId)}
            style={{
              padding: '5px 0',
              borderRadius: 6,
              border: pId === activeId ? '0.5px solid rgba(255,255,255,0.25)' : '0.5px solid transparent',
              background: pId === activeId ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: pId === activeId ? '#ffffff' : 'rgba(255,255,255,0.4)',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {PROVIDER_IDENTITY[pId].name}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Card 1: Observed Activity */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Observed Activity
            </span>
            <span style={{
              fontSize: 8,
              padding: '1px 5px',
              borderRadius: 4,
              background: isServerExact ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
              color: isServerExact ? '#34d399' : '#60a5fa',
              border: isServerExact ? '0.5px solid rgba(16,185,129,0.3)' : '0.5px solid rgba(59,130,246,0.3)',
            }}>
              {isServerExact ? 'Server reported' : 'Local estimate'}
            </span>
          </div>

          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6 }}>
            {formatTokens(observedTokens)} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>tokens</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            <div>Input: <strong style={{ color: '#fff' }}>{formatTokens(state.inputTokens)}</strong></div>
            <div>Output: <strong style={{ color: '#fff' }}>{formatTokens(state.outputTokens)}</strong></div>
            <div>Reasoning: <strong style={{ color: '#fff' }}>{formatTokens(state.reasoningTokens)}</strong></div>
            <div>Cached: <strong style={{ color: '#fff' }}>{formatTokens(state.cachedInputTokens)}</strong></div>
          </div>

          <div style={{ marginTop: 8 }}>
            <SparklineChart history={state.history} color={color} width={300} height={45} />
          </div>
        </div>

        {/* Card 2: Context Window Load */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Conversation Context
            </span>
            <span style={{ fontSize: 9, color: health === 'over_limit' ? '#f87171' : '#34d399', fontWeight: 500 }}>
              {contextPct}% capacity
            </span>
          </div>

          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', margin: '6px 0' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(contextPct, 1)}%`,
              background: health === 'over_limit' ? '#f87171' : color,
              transition: 'width 0.4s',
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            <span>Current: {formatTokens(state.contextTokens || 0)}</span>
            <span>Model Limit: {formatTokens(state.contextLimit || 128_000)}</span>
          </div>
        </div>

        {/* Card 3: Detected Limit & Plan Policy */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: 10,
          padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Quota & Allowance
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
              Reset in {countdown}
            </span>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '4px 0' }}>
            {quota.description}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1.3 }}>
            Provider allowance is compute/message managed. Account quota ceilings are not exposed by the provider.
          </div>
        </div>

        {/* Customization Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <CustomDropdown
            label="Theme"
            value={store.currentTheme}
            options={THEMES}
            onChange={v => store.setTheme(v as ThemeName)}
          />
          <CustomDropdown
            label="Plan Tier"
            value={state.tier}
            options={TIERS}
            onChange={v => store.setProviderTier(state.id, v as SubscriptionTier)}
          />
        </div>

        {/* Card 4: Coverage & Local Backup */}
        <div style={{
          padding: '8px 10px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
          border: '0.5px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
            Scope: <strong>This browser profile only</strong> (zero telemetry).
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleExport('json')}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', color: '#fff', border: '0.5px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', color: '#fff', border: '0.5px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
              }}
            >
              Import JSON
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              style={{ display: 'none' }}
            />
          </div>
          {importStatus && (
            <div style={{ fontSize: 8, color: '#34d399', marginTop: 4, textAlign: 'center' }}>
              {importStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
