/**
 * src/storage/store.ts
 *
 * Central Zustand state store for Trace.
 *
 * Zustand is a minimal state manager (no reducers, no boilerplate).
 * Think of it as a shared JS object that React components can
 * subscribe to — they re-render only when the slice they use changes.
 *
 * Architecture:
 *   - This store lives in the content script / overlay context.
 *   - Persisted snapshots sync to browser.storage.local via
 *     the background service worker (Phase 2).
 *   - The popup reads from browser.storage.local directly.
 */

import { create } from 'zustand'
import type { ProviderId } from '@/providers/logos'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderUsage {
  id:             ProviderId
  tokensUsed:     number   // estimated tokens consumed today
  tokensTotal:    number   // estimated daily quota
  percentUsed:    number   // 0–100
  resetAt:        number   // unix timestamp — when quota resets
  lastActiveAt:   number   // unix timestamp — last message sent
  messageCount:   number   // messages today
  isActive:       boolean  // currently on this provider's page
}

export interface TraceStore {
  // Provider data
  providers:    Record<ProviderId, ProviderUsage>
  activeProvider: ProviderId | null

  // UI state
  overlayOpen:    boolean
  expandedView:   boolean
  currentTheme:   ThemeName

  // Actions
  updateUsage:     (id: ProviderId, delta: Partial<ProviderUsage>) => void
  setActiveProvider: (id: ProviderId | null) => void
  toggleOverlay:   () => void
  setExpandedView: (expanded: boolean) => void
  setTheme:        (theme: ThemeName) => void
}

export type ThemeName = 'catppuccin' | 'nord' | 'tokyonight' | 'gruvbox' | 'dracula' | 'everforest'

// ─── Default usage for a provider ────────────────────────────────────────────

function defaultUsage(id: ProviderId): ProviderUsage {
  return {
    id,
    tokensUsed:   0,
    tokensTotal:  40000, // conservative default; adapters refine this
    percentUsed:  0,
    resetAt:      Date.now() + 24 * 60 * 60 * 1000, // 24h from now
    lastActiveAt: 0,
    messageCount: 0,
    isActive:     false,
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTraceStore = create<TraceStore>((set) => ({
  providers: {
    chatgpt:    defaultUsage('chatgpt'),
    claude:     defaultUsage('claude'),
    gemini:     defaultUsage('gemini'),
    grok:       defaultUsage('grok'),
    perplexity: defaultUsage('perplexity'),
    deepseek:   defaultUsage('deepseek'),
    meta:       defaultUsage('meta'),
  },

  activeProvider:  null,
  overlayOpen:     false,
  expandedView:    false,
  currentTheme:    'catppuccin',

  updateUsage: (id, delta) =>
    set((state) => {
      const current = state.providers[id]
      const updated = { ...current, ...delta }
      updated.percentUsed = Math.round((updated.tokensUsed / updated.tokensTotal) * 100)
      return {
        providers: { ...state.providers, [id]: updated },
      }
    }),

  setActiveProvider: (id) => set({ activeProvider: id }),

  toggleOverlay: () =>
    set((state) => ({ overlayOpen: !state.overlayOpen })),

  setExpandedView: (expanded) => set({ expandedView: expanded }),

  setTheme: (theme) => set({ currentTheme: theme }),
}))
