import { create } from 'zustand'
import type { ProviderId } from '@/providers/logos'

export interface ProviderUsage {
  id:           ProviderId
  tokensUsed:   number
  tokensTotal:  number
  percentUsed:  number
  resetAt:      number
  lastActiveAt: number
  messageCount: number
  isActive:     boolean
}

export interface TraceStore {
  providers:       Record<ProviderId, ProviderUsage>
  activeProvider:  ProviderId | null
  overlayOpen:     boolean
  expandedView:    boolean
  currentTheme:    ThemeName

  updateUsage:       (id: ProviderId, delta: Partial<ProviderUsage>) => void
  addTokens:         (id: ProviderId, tokens: number) => void
  setActiveProvider: (id: ProviderId | null) => void
  toggleOverlay:     () => void
  setExpandedView:   (expanded: boolean) => void
  setTheme:          (theme: ThemeName) => void
  loadFromStorage:   () => Promise<void>
  persistToStorage:  () => void
}

export type ThemeName = 'catppuccin' | 'nord' | 'tokyonight' | 'gruvbox' | 'dracula' | 'everforest'

// Daily quota estimates per provider (conservative)
const QUOTA: Record<ProviderId, number> = {
  chatgpt:    40000,
  claude:     45000,
  gemini:     60000,
  grok:       25000,
  perplexity: 20000,
  deepseek:   50000,
  meta:       30000,
}

// Reset intervals per provider (ms)
const RESET_INTERVAL: Record<ProviderId, number> = {
  chatgpt:    3 * 60 * 60 * 1000,  // 3h rolling
  claude:     8 * 60 * 60 * 1000,  // 8h rolling
  gemini:     24 * 60 * 60 * 1000, // daily
  grok:       24 * 60 * 60 * 1000, // daily
  perplexity: 24 * 60 * 60 * 1000, // daily
  deepseek:   24 * 60 * 60 * 1000, // daily
  meta:       24 * 60 * 60 * 1000, // daily
}

function defaultUsage(id: ProviderId): ProviderUsage {
  return {
    id,
    tokensUsed:   0,
    tokensTotal:  QUOTA[id],
    percentUsed:  0,
    resetAt:      Date.now() + RESET_INTERVAL[id],
    lastActiveAt: 0,
    messageCount: 0,
    isActive:     false,
  }
}

const ALL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'deepseek', 'meta']

function makeDefaultProviders(): Record<ProviderId, ProviderUsage> {
  return Object.fromEntries(
    ALL_PROVIDERS.map(id => [id, defaultUsage(id)])
  ) as Record<ProviderId, ProviderUsage>
}

export const useTraceStore = create<TraceStore>((set, get) => ({
  providers:      makeDefaultProviders(),
  activeProvider: null,
  overlayOpen:    false,
  expandedView:   false,
  currentTheme:   'catppuccin',

  updateUsage: (id, delta) =>
    set(state => {
      const current = state.providers[id]
      const updated = { ...current, ...delta }
      updated.percentUsed = Math.min(100, Math.round((updated.tokensUsed / updated.tokensTotal) * 100))
      return { providers: { ...state.providers, [id]: updated } }
    }),

  addTokens: (id, tokens) =>
    set(state => {
      const current = state.providers[id]
      const tokensUsed = current.tokensUsed + tokens
      const percentUsed = Math.min(100, Math.round((tokensUsed / current.tokensTotal) * 100))
      return {
        providers: {
          ...state.providers,
          [id]: { ...current, tokensUsed, percentUsed, lastActiveAt: Date.now() }
        }
      }
    }),

  setActiveProvider: (id) => set({ activeProvider: id }),
  toggleOverlay:     () => set(state => ({ overlayOpen: !state.overlayOpen })),
  setExpandedView:   (expanded) => set({ expandedView: expanded }),
  setTheme:          (theme) => set({ currentTheme: theme }),

  // Load persisted usage from browser.storage.local on init
  loadFromStorage: async () => {
    try {
      const result = await chrome.storage.local.get('trace_usage')
      if (!result.trace_usage) return
      const saved = result.trace_usage as Record<string, Partial<ProviderUsage>>
      const defaults = makeDefaultProviders()
      const merged = Object.fromEntries(
        ALL_PROVIDERS.map(id => {
          const s = saved[id]
          if (!s) return [id, defaults[id]]
          // If reset time has passed, start fresh
          const isExpired = Date.now() > (s.resetAt ?? 0)
          if (isExpired) return [id, defaultUsage(id)]
          const merged = { ...defaults[id], ...s }
          merged.percentUsed = Math.min(100, Math.round((merged.tokensUsed / merged.tokensTotal) * 100))
          return [id, merged]
        })
      ) as Record<ProviderId, ProviderUsage>
      set({ providers: merged })
    } catch {
      // storage unavailable — use defaults
    }
  },

  // Persist current usage to browser.storage.local
  persistToStorage: () => {
    try {
      const { providers } = get()
      chrome.storage.local.set({ trace_usage: providers })
    } catch {
      // ignore
    }
  },
}))
