/**
 * src/popup/popup.tsx
 *
 * Trace Extension Popup.
 * Features:
 * - Top header with TRACE [Plan Tier] and today's total tokens
 * - Plan Policy and Theme selectors
 * - Dual-bar provider cards matching the HUD aesthetics
 * - Local Profile Scope banner and JSON Export/Import
 */

import React, { useEffect, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  ALL_PROVIDERS,
  getSessionPercent,
  getWeeklyPercent,
  getObservedTokens,
  exportDataAsCSV,
  exportDataAsJSON,
  type SubscriptionTier,
  type ThemeName,
  type ProviderId,
} from '@/storage/store'
import { formatTokens, formatResetTime } from '@/tracking/estimator'
import { ProviderLogo } from '@/components/ui/ProviderLogo'
import { CustomDropdown } from '@/components/ui/CustomDropdown'
import '@/overlay/overlay.css'

const TIERS: { id: SubscriptionTier; label: string; icon: string }[] = [
  { id: 'free', label: 'Free Plan', icon: '🌱' },
  { id: 'pro', label: 'Pro / Plus', icon: '⚡' },
  { id: 'team', label: 'Team Plan', icon: '👥' },
  { id: 'enterprise', label: 'Enterprise', icon: '🏛️' },
]

const THEMES: { id: ThemeName; label: string; icon: string }[] = [
  { id: 'catppuccin', label: 'Catppuccin', icon: '🎨' },
  { id: 'nord', label: 'Nord', icon: '❄️' },
  { id: 'tokyonight', label: 'Tokyo Night', icon: '🌃' },
  { id: 'gruvbox', label: 'Gruvbox', icon: '📜' },
  { id: 'dracula', label: 'Dracula', icon: '🧛' },
  { id: 'everforest', label: 'Everforest', icon: '🌲' },
  { id: 'liquidglass', label: 'Liquid Glass', icon: '🌊' },
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

function PopupApp() {
  const store = useTraceStore()
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.init().catch(console.error)
  }, [])

  const totalObserved = ALL_PROVIDERS.reduce(
    (sum, id) => sum + getObservedTokens(store.providers[id]),
    0
  )

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
        width: 340,
        minHeight: 460,
        background: 'var(--trace-bg-gradient, #111319)',
        color: 'var(--trace-text-primary, #ffffff)',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: '16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.8px', color: '#ffffff', textTransform: 'uppercase' }}>
            TRACE
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, padding: '1.5px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>
            {store.currentTier}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', fontWeight: 500 }}>
            {formatTokens(totalObserved)} today
          </span>
        </div>
      </div>

      {/* Plan Tier & Theme Selectors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600 }}>
            PLAN POLICY
          </div>
          <CustomDropdown
            label=""
            value={store.currentTier}
            options={TIERS}
            onChange={val => store.setTier(val as SubscriptionTier)}
          />
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontWeight: 600 }}>
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

      {/* Provider List with Dual Progress Bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
          OBSERVED PROVIDERS
        </div>

        {ALL_PROVIDERS.map(id => {
          const p = store.providers[id]
          const { name, color } = PROVIDER_IDENTITY[id]
          const sessionPct = getSessionPercent(p)
          const weeklyPct = getWeeklyPercent(p)
          const sessionWin = p.planPolicy?.windows?.find(w => w.name === 'session')
          const weeklyWin = p.planPolicy?.windows?.find(w => w.name === 'weekly')
          const sessionCountdown = useCountdown(sessionWin?.resetAt ?? p.sessionUsage?.resetAt)
          const weeklyCountdown = useCountdown(weeklyWin?.resetAt ?? p.weeklyUsage?.resetAt)

          return (
            <div
              key={id}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '0.5px solid rgba(255, 255, 255, 0.07)',
                borderRadius: 10,
                padding: '9px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              {/* Row 1 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ProviderLogo provider={id} size={18} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>{name}</span>
                  <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.4)' }}>
                    {p.activeModel}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>S:</span>
                  <strong style={{ color: '#ffffff' }}>{sessionPct}%</strong>
                  <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>·</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>W:</span>
                  <strong style={{ color: '#818cf8' }}>{weeklyPct}%</strong>
                  <button
                    onClick={() => store.toggleProviderEnabled(id)}
                    style={{
                      marginLeft: 4,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: p.enabled ? '0.5px solid rgba(16,185,129,0.35)' : '0.5px solid rgba(239,68,68,0.35)',
                      background: p.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: p.enabled ? '#34d399' : '#f87171',
                      fontSize: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {p.enabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              {/* Row 2: Dual Bars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 2 }}>
                <div>
                  <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(sessionPct, sessionPct > 0 ? 3 : 0)}%`, background: color, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(255, 255, 255, 0.3)', marginTop: 2 }}>
                    <span>Session</span>
                    <span>{sessionCountdown}</span>
                  </div>
                </div>

                <div>
                  <div style={{ height: 3, background: 'rgba(255, 255, 255, 0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(weeklyPct, weeklyPct > 0 ? 3 : 0)}%`, background: '#6366f1', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(255, 255, 255, 0.3)', marginTop: 2 }}>
                    <span>Weekly</span>
                    <span>{weeklyCountdown}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Scope Banner & Backup Buttons */}
      <div style={{
        marginTop: 'auto',
        padding: '10px 12px',
        background: 'rgba(0, 0, 0, 0.22)',
        borderRadius: 10,
        border: '0.5px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        <div style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)' }}>
          Scope: <strong style={{ color: '#ffffff' }}>This browser profile only</strong> (zero telemetry).
        </div>

        {importStatus && (
          <div style={{ fontSize: 9, color: '#34d399', fontWeight: 500 }}>
            {importStatus}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          <button
            onClick={() => handleExport('json')}
            style={{
              padding: '5px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '0.5px solid rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
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
              padding: '5px 8px',
              borderRadius: 6,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '0.5px solid rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
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
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<PopupApp />)
}
