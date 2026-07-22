import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  useTraceStore,
  PROVIDER_IDENTITY,
  ALL_PROVIDERS,
  getSessionPercent,
  type SubscriptionTier,
  type ThemeName,
} from '@/storage/store'
import { ProviderLogo } from '@/components/ui/ProviderLogo'

const TIERS: { id: SubscriptionTier; name: string }[] = [
  { id: 'free', name: 'Free Plan (0.5x)' },
  { id: 'pro', name: 'Pro / Plus (1.0x)' },
  { id: 'team', name: 'Team Plan (2.5x)' },
  { id: 'enterprise', name: 'Enterprise (5.0x)' },
]

const THEMES: { id: ThemeName; name: string }[] = [
  { id: 'catppuccin', name: 'Catppuccin' },
  { id: 'nord', name: 'Nord' },
  { id: 'tokyonight', name: 'Tokyo Night' },
  { id: 'gruvbox', name: 'Gruvbox' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'everforest', name: 'Everforest' },
]

function PopupApp() {
  const store = useTraceStore()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    store.init().then(() => setLoaded(true))
  }, [])

  if (!loaded) {
    return (
      <div style={{ padding: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', background: '#0d0f14', width: 280 }}>
        Loading Trace...
      </div>
    )
  }

  return (
    <div style={{
      width: 300,
      padding: '16px',
      background: '#0d0f14',
      color: '#ffffff',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px', color: '#ffffff' }}>Trace</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Ambient AI usage tracker</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.1)', padding: '3px 8px', borderRadius: 12, border: '0.5px solid rgba(16,185,129,0.2)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: 9, color: '#10b981', fontWeight: 500 }}>Active</span>
        </div>
      </div>

      {/* Plan Tier Selector */}
      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Subscription Plan</div>
        <select
          value={store.currentTier}
          onChange={e => store.setTier(e.target.value as SubscriptionTier)}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#ffffff',
            fontSize: 11,
            padding: '5px 8px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {TIERS.map(t => (
            <option key={t.id} value={t.id} style={{ background: '#0d0f14', color: '#ffffff' }}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Provider List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Supported Providers</div>
        {ALL_PROVIDERS.map(id => {
          const p = store.providers[id]
          const meta = PROVIDER_IDENTITY[id]
          const pct = getSessionPercent(p)
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProviderLogo provider={id} size={16} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{meta.name}</span>
                  <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                    {p.activeModel}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: pct >= 80 ? '#f87171' : 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                {pct}% used
              </span>
            </div>
          )
        })}
      </div>

      {/* Theme Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Theme</span>
        <select
          value={store.currentTheme}
          onChange={e => store.setTheme(e.target.value as ThemeName)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 10,
            padding: '3px 6px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {THEMES.map(t => (
            <option key={t.id} value={t.id} style={{ background: '#0d0f14', color: '#ffffff' }}>{t.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

const root = document.getElementById('root')!
createRoot(root).render(<PopupApp />)
