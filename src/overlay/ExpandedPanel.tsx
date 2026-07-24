/**
 * src/overlay/ExpandedPanel.tsx
 */

import { useState, useEffect } from 'react'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  getSessionPercent,
  getWeeklyPercent,
  getRemaining,
  getProviderHealth,
  type ProviderId,
  type ThemeName,
  type SubscriptionTier,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'
import { ProviderLogo } from '@/components/ui/ProviderLogo'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini']
const THEMES: { id: ThemeName; name: string }[] = [
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'nord', name: 'Nord' },
  { id: 'tokyonight', name: 'Tokyo Night' },
  { id: 'gruvbox', name: 'Gruvbox' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'everforest', name: 'Everforest' },
  { id: 'liquidglass', name: 'Liquid Glass 🌊' },
]
const TIERS: { id: SubscriptionTier; name: string }[] = [
  { id: 'free', name: 'Free Plan' },
  { id: 'pro', name: 'Pro / Plus' },
  { id: 'team', name: 'Team Plan' },
  { id: 'enterprise', name: 'Enterprise' },
]

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

function CacheCountdown({ expiresAt }: { expiresAt: number }) {
  const [rem, setRem] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = expiresAt - Date.now()
      if (diff <= 0) {
        setRem('Expired')
      } else {
        const m = Math.floor(diff / 60000)
        const s = Math.floor((diff % 60000) / 1000)
        setRem(`${m}m ${s < 10 ? '0' : ''}${s}s`)
      }
    }
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [expiresAt])
  return <span>{rem}</span>
}

function SparklineChart({ history, color, width = 310, height = 110 }: {
  history: { sessionPercent: number }[]; color: string; width?: number; height?: number
}) {
  if (history.length === 0) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.01)',
        borderRadius: 10,
        border: '0.5px dashed rgba(255,255,255,0.08)'
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Waiting for usage data points...</span>
      </div>
    )
  }

  const data = history.length === 1 ? [history[0], history[0]] : history
  const maxVal = 100
  const pointsCount = data.length

  const coords = data.map((pt, i) => {
    const x = (i / (pointsCount - 1)) * width
    const y = height - (pt.sessionPercent / maxVal) * height * 0.82 - 8
    return { x, y }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.00" />
        </linearGradient>
      </defs>

      <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
      <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
      <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

      <path d={areaPath} fill={`url(#gradient-${color})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {coords.length > 0 && (
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3" fill={color} stroke="#0d0f14" strokeWidth="1.2" />
      )}
    </svg>
  )
}

export function ExpandedPanel() {
  const providers = useTraceStore(s => s.providers)
  const setExpandedView = useTraceStore(s => s.setExpandedView)
  const currentTheme = useTraceStore(s => s.currentTheme)
  const setTheme = useTraceStore(s => s.setTheme)

  const [selectedId, setSelectedId] = useState<ProviderId>('chatgpt')
  const activeState = providers[selectedId]
  const meta = PROVIDER_IDENTITY[selectedId]

  const sessionPct = getSessionPercent(activeState)
  const weeklyPct = getWeeklyPercent(activeState)
  const remainingSession = getRemaining(activeState, 'session')
  const remainingWeekly = getRemaining(activeState, 'weekly')
  const health = getProviderHealth(activeState)
  const countdown = useCountdown(activeState.sessionUsage.resetAt)

  const totalTokensCombined = PANEL_PROVIDERS.reduce((sum, id) => sum + providers[id].totalTokens, 0)

  return (
    <div style={{
      width: 560,
      background: 'var(--trace-bg-gradient, #0d0f14)',
      border: '0.5px solid var(--trace-border-muted, rgba(255,255,255,0.12))',
      borderRadius: 'var(--trace-panel-radius, 16px)',
      backdropFilter: 'var(--trace-panel-blur, blur(20px))',
      WebkitBackdropFilter: 'var(--trace-panel-blur, blur(20px))',
      boxShadow: 'var(--trace-panel-shadow, 0 8px 32px rgba(0,0,0,0.5))',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      animation: 'trace-slide-up 0.2s ease-out',
    }}>
      {/* Left Sidebar */}
      <div style={{
        width: 210,
        borderRight: '0.5px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '12px 14px',
          borderBottom: '0.5px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Providers
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{formatTokens(totalTokensCombined)} combined</span>
        </div>

        <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {PANEL_PROVIDERS.map(id => {
            const state = providers[id]
            const pm = PROVIDER_IDENTITY[id]
            const active = selectedId === id
            const pct = getSessionPercent(state)

            return (
              <div
                key={id}
                onClick={() => setSelectedId(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: active ? 'rgba(255,255,255,0.05)' : 'transparent',
                  transition: 'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e => !active && (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ProviderLogo provider={id} size={18} />
                  {state.isActive && (
                    <div style={{
                      position: 'absolute', bottom: -2, right: -2,
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#10b981', border: '1px solid #0d0f14',
                    }} />
                  )}
                </div>
                
                <span style={{
                  fontSize: 12,
                  fontWeight: active ? 500 : 400,
                  color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                  flex: 1,
                }}>
                  {pm.name}
                </span>

                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: pct >= 80 ? '#f87171' : 'rgba(255,255,255,0.3)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {pct > 0 ? `${pct}%` : '0%'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Settings Footer: Theme & Plan Tier (Per Provider) */}
        <div style={{
          padding: '10px 14px',
          borderTop: '0.5px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              {meta.name} Plan Tier
            </div>
            <select
              value={activeState.tier || 'pro'}
              onChange={e => useTraceStore.getState().setProviderTier(selectedId, e.target.value as SubscriptionTier)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.85)',
                fontSize: 11,
                padding: '4px 6px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {TIERS.map(t => (
                <option key={t.id} value={t.id} style={{ background: '#0d0f14', color: '#fff' }}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Theme</div>
            <select
              value={currentTheme}
              onChange={e => setTheme(e.target.value as any)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.85)',
                fontSize: 11,
                padding: '4px 6px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id} style={{ background: '#0d0f14', color: '#fff' }}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Right Details Panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '0.5px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ProviderLogo provider={selectedId} size={22} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                {meta.name} Detailed Usage
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                Model: <span style={{ color: meta.color }}>{activeState.activeModel}</span> · Tier: <span style={{ textTransform: 'uppercase' }}>{activeState.tier}</span>
              </div>
            </div>
          </div>
          <span
            onClick={() => setExpandedView(false)}
            style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.5)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            ← back
          </span>
        </div>

        {/* Stats Grid */}
        <div style={{
          padding: '14px 16px 10px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>Total Tokens</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#ffffff' }}>{formatTokens(activeState.totalTokens)}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', marginTop: 2 }}>in: {formatTokens(activeState.inputTokens)} · out: {formatTokens(activeState.outputTokens)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>Session Usage</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: health === 'over_limit' ? '#f87171' : '#ffffff' }}>
              {sessionPct}%
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', marginTop: 2 }}>{formatTokens(remainingSession)} remaining</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>Context & Cache</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
              {formatTokens(activeState.contextTokens)} / {formatTokens(activeState.contextLimit)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              Cache: {activeState.cacheExpiresAt > Date.now() ? <CacheCountdown expiresAt={activeState.cacheExpiresAt} /> : 'Inactive'}
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div style={{
          padding: '10px 16px 16px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Usage History (50m window)
            </span>
            <span style={{ fontSize: 9, color: meta.color, fontWeight: 500 }}>
              Session Limit: {formatTokens(activeState.sessionUsage.total)}
            </span>
          </div>

          <div style={{
            flex: 1,
            background: 'rgba(0,0,0,0.15)',
            border: '0.5px solid rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: '12px 10px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}>
            <SparklineChart history={activeState.history} color={meta.color} />
          </div>
        </div>
      </div>
    </div>
  )
}
