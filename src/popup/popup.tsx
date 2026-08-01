import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  ALL_PROVIDERS,
  getSessionPercent,
  exportDataAsCSV,
  exportDataAsJSON,
  type SubscriptionTier,
  type ThemeName,
} from '@/storage/store'

function handleExport(format: 'csv' | 'json', storeProviders: ReturnType<typeof useTraceStore.getState>['providers']) {
  const content = format === 'csv' ? exportDataAsCSV(storeProviders) : exportDataAsJSON(storeProviders)
  const mime = format === 'csv' ? 'text/csv' : 'application/json'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trace-usage-backup.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
import { ProviderLogo } from '@/components/ui/ProviderLogo'
import { CustomDropdown } from '@/components/ui/CustomDropdown'
import '@/overlay/overlay.css'

const TIERS: { id: SubscriptionTier; label: string; icon: string }[] = [
  { id: 'free', label: 'Free Plan (0.5x)', icon: '🌱' },
  { id: 'pro', label: 'Pro / Plus (1.0x)', icon: '⚡' },
  { id: 'team', label: 'Team Plan (2.5x)', icon: '👥' },
  { id: 'enterprise', label: 'Enterprise (5.0x)', icon: '🏛️' },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', color: '#ffffff' }}>Trace</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Ambient AI usage tracker</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.15)', padding: '4px 10px', borderRadius: 9999, border: '0.5px solid rgba(16,185,129,0.3)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          <span style={{ fontSize: 9, color: '#34d399', fontWeight: 600 }}>Active</span>
        </div>
      </div>

      {/* Plan Tier Selector */}
      <div style={{ marginBottom: 12 }}>
        <CustomDropdown
          label="Subscription Plan"
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
          const meta = PROVIDER_IDENTITY[id]
          const pct = getSessionPercent(p)
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 14, background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)', border: '0.5px solid rgba(255,255,255,0.18)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25)', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProviderLogo provider={id} size={16} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>{meta.name}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 9999, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', border: '0.5px solid rgba(255,255,255,0.2)' }}>
                    {p.activeModel}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: pct >= 80 ? '#f87171' : 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                {pct}% used
              </span>
            </div>
          )
        })}
      </div>

      {/* Theme Selector & Data Export */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.15)' }}>
        <CustomDropdown
          label="Theme"
          value={store.currentTheme}
          options={THEMES}
          direction="up"
          onChange={val => store.setTheme(val as ThemeName)}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
          <button
            onClick={() => handleExport('csv', store.providers)}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.8)',
              fontSize: 10,
              padding: '5px 8px',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span>📊 Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('json', store.providers)}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.8)',
              fontSize: 10,
              padding: '5px 8px',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span>💾 Export JSON</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById('root')!
createRoot(root).render(<PopupApp />)
