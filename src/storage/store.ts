import { create } from 'zustand'
import type { ProviderId } from '@/providers/logos'

export interface ProviderUsage {
  id: ProviderId
  tokensUsed: number
  tokensTotal: number
  tokenPercentUsed: number  // Heuristic-driven text estimation
  quotaPercentUsed: number  // Precise, UI-scraped quota status (0-100)
  resetAt: number
  lastActiveAt: number
  messageCount: number
  isActive: boolean
}

export type ThemeName = 'catppuccin' | 'nord' | 'tokyonight' | 'gruvbox' | 'dracula' | 'everforest'

export interface TraceStore {
  providers: Record<ProviderId, ProviderUsage>
  activeProvider: ProviderId | null
  overlayOpen: boolean
  expandedView: boolean
  currentTheme: ThemeName

  init: () => Promise<void>
  updateUsage: (id: ProviderId, delta: Partial<ProviderUsage>) => void
  incrementMessageCount: (id: ProviderId) => void
  addTokens: (id: ProviderId, tokens: number) => void
  setActiveProvider: (id: ProviderId | null) => void
  toggleOverlay: () => void
  setExpandedView: (expanded: boolean) => void
  setTheme: (theme: ThemeName) => void
  loadFromStorage: () => Promise<void>
  persistToStorage: () => Promise<void>
  checkQuotaExpirations: () => void
  startAutoTimer: () => void
  stopAutoTimer: () => void
}

const QUOTA: Record<ProviderId, number> = {
  chatgpt: 40000,
  claude: 45000,
  gemini: 60000,
  grok: 25000,
  perplexity: 20000,
  deepseek: 50000,
  meta: 30000,
}

const RESET_INTERVAL: Record<ProviderId, number> = {
  chatgpt: 3 * 60 * 60 * 1000,  // 3h rolling
  claude: 8 * 60 * 60 * 1000,  // 8h rolling
  gemini: 24 * 60 * 60 * 1000, // daily
  grok: 24 * 60 * 60 * 1000, // daily
  perplexity: 24 * 60 * 60 * 1000, // daily
  deepseek: 24 * 60 * 60 * 1000, // daily
  meta: 24 * 60 * 60 * 1000, // daily
}

function defaultUsage(id: ProviderId): ProviderUsage {
  return {
    id,
    tokensUsed: 0,
    tokensTotal: QUOTA[id],
    tokenPercentUsed: 0,
    quotaPercentUsed: 0,
    resetAt: Date.now() + RESET_INTERVAL[id],
    lastActiveAt: 0,
    messageCount: 0,
    isActive: false,
  }
}

const ALL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'deepseek', 'meta']

function makeDefaultProviders(): Record<ProviderId, ProviderUsage> {
  return Object.fromEntries(
    ALL_PROVIDERS.map(id => [id, defaultUsage(id)])
  ) as Record<ProviderId, ProviderUsage>
}

let dbTimeoutRef: ReturnType<typeof globalThis.setTimeout> | null = null
let autoTimerRef: ReturnType<typeof globalThis.setInterval> | null = null

export const useTraceStore = create<TraceStore>((set, get) => {

  const scheduleDebouncedWrite = () => {
    if (dbTimeoutRef) {
      globalThis.clearTimeout(dbTimeoutRef)
    }

    dbTimeoutRef = globalThis.setTimeout(async () => {
      try {
        await chrome.storage.local.set({ trace_usage: get().providers })
      } catch (err) {
        console.warn('[Trace Store] Storage save failure:', err)
      }
      dbTimeoutRef = null
    }, 1500)
  }

  return {
    providers: makeDefaultProviders(),
    activeProvider: null,
    overlayOpen: false,
    expandedView: false,
    currentTheme: 'catppuccin',

    // ✅ UNIFIED INITIALIZATION METHOD: Resolves the initialization lifecycle vulnerability entirely
    init: async () => {
      get().startAutoTimer()
      await get().loadFromStorage()
    },

    updateUsage: (id, delta) => {
      const current = get().providers[id]
      if (!current) return

      // ✅ FIX: Type-safe change verification that removes the 'as any' casting completely
      const keys = Object.keys(delta) as (keyof typeof delta)[]
      const hasChanges = keys.some((k) => delta[k] !== current[k])
      if (!hasChanges) return

      set(state => {
        const target = state.providers[id]
        if (!target) return state // Defensive guardrail replaces brittle non-null assertions (!)

        const updated = { ...target, ...delta }
        const safeTotal = Math.max(1, updated.tokensTotal)
        updated.tokenPercentUsed = Math.min(100, Math.round((updated.tokensUsed / safeTotal) * 100))

        return { providers: { ...state.providers, [id]: updated } }
      })

      scheduleDebouncedWrite()
    },

    incrementMessageCount: (id) => {
      const current = get().providers[id]
      if (!current) return

      set(state => {
        const target = state.providers[id]
        if (!target) return state

        const updated = {
          ...target,
          messageCount: target.messageCount + 1,
          lastActiveAt: Date.now()
        }
        return { providers: { ...state.providers, [id]: updated } }
      })

      scheduleDebouncedWrite()
    },

    addTokens: (id, tokens) => {
      const current = get().providers[id]
      if (!current || tokens <= 0) return

      set(state => {
        const target = state.providers[id]
        if (!target) return state

        const tokensUsed = target.tokensUsed + tokens
        const safeTotal = Math.max(1, target.tokensTotal)
        const tokenPercentUsed = Math.min(100, Math.round((tokensUsed / safeTotal) * 100))

        const updated = {
          ...target,
          tokensUsed,
          tokenPercentUsed,
          lastActiveAt: Date.now()
        }
        return { providers: { ...state.providers, [id]: updated } }
      })

      scheduleDebouncedWrite()
    },

    checkQuotaExpirations: () => {
      let changed = false
      const now = Date.now()
      const currentProviders = get().providers

      ALL_PROVIDERS.forEach(id => {
        const provider = currentProviders[id]
        if (provider && now > provider.resetAt) {
          changed = true
        }
      })

      if (!changed) return

      set(state => {
        const updatedProviders = { ...state.providers }
        ALL_PROVIDERS.forEach(id => {
          const provider = updatedProviders[id]
          if (provider && now > provider.resetAt) {
            updatedProviders[id] = defaultUsage(id)
          }
        })
        return { providers: updatedProviders }
      })

      scheduleDebouncedWrite()
    },

    startAutoTimer: () => {
      if (autoTimerRef !== null) return

      autoTimerRef = globalThis.setInterval(() => {
        get().checkQuotaExpirations()
      }, 60000) // Checks cleanly every 60 seconds
    },

    stopAutoTimer: () => {
      if (autoTimerRef === null) return
      globalThis.clearInterval(autoTimerRef)
      autoTimerRef = null
    },

    setActiveProvider: (id) => set({ activeProvider: id }),
    toggleOverlay: () => set(state => ({ overlayOpen: !state.overlayOpen })),
    setExpandedView: (expanded) => set({ expandedView: expanded }),
    setTheme: (theme) => set({ currentTheme: theme }),

    loadFromStorage: async () => {
      try {
        const result = await chrome.storage.local.get('trace_usage')
        if (!result.trace_usage) return

        const saved = result.trace_usage as Record<ProviderId, Partial<ProviderUsage> & { percentUsed?: number }>
        const defaults = makeDefaultProviders()

        const merged = Object.fromEntries(
          ALL_PROVIDERS.map(id => {
            const s = saved[id]
            if (!s) return [id, defaults[id]]

            const isExpired = Date.now() > (s.resetAt ?? 0)
            if (isExpired) return [id, defaultUsage(id)]

            const legacyPercentFallback = s.percentUsed ?? 0
            const migratedItem: ProviderUsage = {
              ...defaults[id],
              ...s,
              tokensUsed: s.tokensUsed ?? 0,
              tokensTotal: s.tokensTotal ?? QUOTA[id],
              quotaPercentUsed: s.quotaPercentUsed ?? legacyPercentFallback,
              messageCount: s.messageCount ?? 0,
              isActive: false
            }

            const safeTotal = Math.max(1, migratedItem.tokensTotal)
            migratedItem.tokenPercentUsed = Math.min(100, Math.round((migratedItem.tokensUsed / safeTotal) * 100))
            return [id, migratedItem]
          })
        ) as Record<ProviderId, ProviderUsage>

        set({ providers: merged })
      } catch (err) {
        console.error('[Trace Store] Error reading initial layer:', err)
      }
    },

    persistToStorage: async () => {
      if (dbTimeoutRef) {
        globalThis.clearTimeout(dbTimeoutRef)
        dbTimeoutRef = null
      }
      try {
        await chrome.storage.local.set({ trace_usage: get().providers })
      } catch (err) {
        console.warn('[Trace Store] Direct persistence failed:', err)
      }
    },
  }
})
