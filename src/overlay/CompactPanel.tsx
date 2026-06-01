/**
 * src/overlay/CompactPanel.tsx
 * Phase 2 — compact popup panel with all provider rows.
 */

import { useTraceStore } from '@/storage/store'
import { PROVIDERS, type ProviderId } from '@/providers/logos'
import { ProviderLogo } from '@/components/ui/ProviderLogo'
import { formatTokens, formatResetTime } from '@/tracking/estimator'

const PANEL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity']

export function CompactPanel() {
  const providers = useTraceStore(s => s.providers)
  const totalTokens = PANEL_PROVIDERS.reduce((sum, id) => sum + providers[id].tokensUsed, 0)

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
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 14px 9px',
        borderBottom: '0.5px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>
            Trace
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#10b981',
            animation: 'trace-breathe 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
            {formatTokens(totalTokens)} today
          </span>
        </div>
      </div>

      {/* Provider rows */}
      <div style={{ padding: '6px 0' }}>
        {PANEL_PROVIDERS.map(id => (
          <ProviderRow key={id} id={id} />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '7px 14px 9px',
        borderTop: '0.5px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
          local estimate · no cloud
        </span>
        <span style={{
          fontSize: 10,
          padding: '2px 7px',
          borderRadius: 10,
          background: 'rgba(99,102,241,0.1)',
          color: 'rgba(129,140,248,0.7)',
          border: '0.5px solid rgba(99,102,241,0.18)',
        }}>
          ↗ expand
        </span>
      </div>
    </div>
  )
}

function ProviderRow({ id }: { id: ProviderId }) {
  const usage = useTraceStore(s => s.providers[id])
  const meta = PROVIDERS[id]
  const pct = usage.quotaPercentUsed
  const isHigh = pct >= 80
  const isMed = pct >= 50 && pct < 80

  const barColor = isHigh
    ? 'rgba(248,113,113,0.9)'
    : isMed
      ? meta.color
      : meta.color

  const pctColor = isHigh ? '#f87171' : 'rgba(255,255,255,0.55)'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 14px',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Icon */}
      <ProviderLogo provider={id} size={26} />

      {/* Name + bar */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>
          {meta.name}
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: barColor,
            boxShadow: `0 0 6px ${barColor}55`,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: pctColor, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}>
          {formatResetTime(usage.resetAt)}
        </span>
      </div>
    </div>
  )
}
