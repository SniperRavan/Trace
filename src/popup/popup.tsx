/**
 * src/popup/popup.tsx
 *
 * Trace Extension Popup.
 * Provides quick overview of observed usage, context window loads,
 * plan policy selection, and local JSON backup/restore.
 */

import { useEffect, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  ALL_PROVIDERS,
  getContextPercent,
  getObservedTokens,
  getQuotaDisplay,
  exportDataAsCSV,
  exportDataAsJSON,
  type SubscriptionTier,
  type ThemeName,
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

function PopupApp() {
  const store = useTraceStore()
  const [loaded, setLoaded] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.init().then(() => setLoaded(true))
  }, [])

  if (!loaded) {
    return (
      <div style={{ padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', background: '#0d0f14', width: 330 }}>
        Loading Trace...
      </div>
    )
  }

  const handleExport = (format: 'json' | 'csv') => {
    const content = format === 'json' ? exportDataAsJSON(store.providers) : exportDataAsCSV(store.providers)
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace-usage-backup.${format}`
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
    <div data-theme={store.currentTheme} style={{
      width: 330,
      padding: '16px',
      background: 'var(--trace-bg-gradient, #0d0f14)',
      color: 'var(--trace-text-primary, #ffffff)',
      fontFamily: "'Inter', system-ui, sans-serif",
      boxSizing: 'border-box',
      border: '0.5px solid var(--trace-border-muted, rgba(255,255,255,0.12))',
      borderRadius: 'var(--trace-panel-radius, 16px)',
      backdropFilter: 'var(--trace-panel-blur, blur(20px))',
      WebkitBackdropFilter: 'var(--trace-panel-blur, blur(20px))',
      boxShadow: 'var(--trace-panel-shadow, 0 8px 32px rgba(0,0,0,0.5))',
    }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', color: '#ffffff' }}>Trace</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Local AI usage observability</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', padding: '4px 10px', borderRadius: 9999, border: '0.5px solid rgba(16,185,129,0.3)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          <span style={{ fontSize: 9, color: '#34d399', fontWeight: 600 }}>Local Profile</span>
        </div>
      </div>

      {/* Plan Tier Selector */}
      <div style={{ marginBottom: 12 }}>
        <CustomDropdown
          label="Detected Plan Policy"
          value={store.currentTier}
          options={TIERS}
          onChange={val => store.setTier(val as SubscriptionTier)}
        />
      </div>

      {/* Provider List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2, fontWeight: 600 }}>Supported Providers</div>
        {ALL_PROVIDERS.map(id => {
          const p = store.providers[id]
          const { name } = PROVIDER_IDENTITY[id]
          const observed = getObservedTokens(p)
          const ctxPct = getContextPercent(p)
          const quota = getQuotaDisplay(p)
          const isServerExact = p.lastRecord?.source === 'server' && p.lastRecord?.confidence === 'exact'

          return (
            <div key={id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: '9px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProviderLogo provider={id} size={20} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                  <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                    {p.activeModel}
                  </span>
                  {isServerExact && (
                    <span style={{ fontSize: 7, padding: '1px 3px', borderRadius: 2, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                      exact
                    </span>
                  )}
                  <button
                    onClick={() => store.toggleProviderEnabled(id)}
                    style={{
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
                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                  {formatTokens(observed)} tok
                </span>
              </div>

              {/* Context bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(ctxPct, 1)}%`, background: ctxPct >= 80 ? '#f87171' : '#34d399' }} />
                </div>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
                  Ctx: {ctxPct}%
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                <span>{quota.description}</span>
                <span>Reset: {quota.resetAt ? formatResetTime(quota.resetAt) : 'dynamic'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Theme Selector */}
      <div style={{ marginBottom: 12 }}>
        <CustomDropdown
          label="Interface Theme"
          value={store.currentTheme}
          options={THEMES}
          onChange={val => store.setTheme(val as ThemeName)}
        />
      </div>

      {/* Export & Import Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => handleExport('json')}
          style={{
            flex: 1, padding: '7px 0', fontSize: 10, fontWeight: 500,
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)',
            border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Export JSON
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1, padding: '7px 0', fontSize: 10, fontWeight: 500,
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)',
            border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6,
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
        <div style={{ fontSize: 9, color: '#34d399', textAlign: 'center', marginBottom: 6 }}>
          {importStatus}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
        <span>This browser profile only</span>
        <span>Zero cloud telemetry</span>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('popup-root')!)
root.render(<PopupApp />)
