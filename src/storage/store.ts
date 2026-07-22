/*
 * src/storage/store.ts
 */

import { create } from 'zustand'

export const ANALYTICS_REFRESH_INTERVAL = 60_000
export const MAX_HISTORY_POINTS = 50

export function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id
  } catch {
    return false
  }
}

export const PROVIDER_IDENTITY: Record<ProviderId, { letter: string; color: string; name: string }> = {
  chatgpt: { letter: 'G', color: '#10b981', name: 'ChatGPT' },
  claude: { letter: 'C', color: '#f59e0b', name: 'Claude' },
  gemini: { letter: 'M', color: '#818cf8', name: 'Gemini' },
  grok: { letter: 'X', color: '#9ca3af', name: 'Grok' },
  perplexity: { letter: 'P', color: '#06b6d4', name: 'Perplexity' },
  deepseek: { letter: 'D', color: '#3b82f6', name: 'DeepSeek' },
  meta: { letter: 'F', color: '#1877f2', name: 'Meta AI' },
}

export type ProviderId = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'perplexity' | 'deepseek' | 'meta'
export type HealthState = 'healthy' | 'near_limit' | 'over_limit'
export type ThemeName = 'catppuccin' | 'nord' | 'tokyonight' | 'gruvbox' | 'dracula' | 'everforest'
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise'

export const ALL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini', 'grok', 'perplexity', 'deepseek', 'meta']

export const CONTEXT_WINDOW_LIMITS: Record<ProviderId, number> = {
  chatgpt: 128_000,
  claude: 200_000,
  gemini: 1_000_000,
  grok: 128_000,
  perplexity: 128_000,
  deepseek: 128_000,
  meta: 128_000,
}

export const TIER_MULTIPLIERS: Record<SubscriptionTier, number> = {
  free: 0.5,
  pro: 1.0,
  team: 2.5,
  enterprise: 5.0,
}

const SESSION_LIMIT: Record<ProviderId, number> = {
  chatgpt: 40_000,
  claude: 45_000,
  gemini: 60_000,
  grok: 25_000,
  perplexity: 20_000,
  deepseek: 35_000,
  meta: 30_000,
}

const WEEKLY_LIMIT: Record<ProviderId, number> = {
  chatgpt: 200_000,
  claude: 300_000,
  gemini: 500_000,
  grok: 100_000,
  perplexity: 100_000,
  deepseek: 150_000,
  meta: 150_000,
}

const SESSION_RESET_MS: Record<ProviderId, number> = {
  chatgpt: 3 * 60 * 60 * 1_000,
  claude: 8 * 60 * 60 * 1_000,
  gemini: 24 * 60 * 60 * 1_000,
  grok: 24 * 60 * 60 * 1_000,
  perplexity: 24 * 60 * 60 * 1_000,
  deepseek: 24 * 60 * 60 * 1_000,
  meta: 24 * 60 * 60 * 1_000,
}

export interface UsagePeriod {
  used: number
  total: number
  remaining: number
  resetAt: number
}

export interface HistoryPoint {
  timestamp: number
  sessionPercent: number
  weeklyPercent: number
}

export interface ProviderState {
  id: ProviderId
  totalTokens: number
  inputTokens: number
  outputTokens: number
  messageCount: number
  sessionUsage: UsagePeriod
  weeklyUsage: UsagePeriod
  cacheExpiresAt: number
  lastActiveAt: number
  isActive: boolean
  history: HistoryPoint[]
  contextTokens: number
  contextLimit: number
  tier: SubscriptionTier
  activeModel: string
}

export interface TraceStore {
  providers: Record<ProviderId, ProviderState>
  activeProvider: ProviderId | null
  overlayOpen: boolean
  expandedView: boolean
  expandedProvider: ProviderId | null
  currentTheme: ThemeName
  currentTier: SubscriptionTier
  lastAnalyticsAt: number

  init: () => Promise<void>
  loadFromStorage: () => Promise<void>
  persistToStorage: () => Promise<void>
  addTokens: (id: ProviderId, total: number, input?: number, output?: number) => void
  refreshAnalytics: (id: ProviderId) => void
  updateUsage: (id: ProviderId, delta: Partial<ProviderState>) => void
  setExactUsage: (id: ProviderId, sessionPct?: number, weeklyPct?: number, resetAtMs?: number) => void
  setActiveProvider: (id: ProviderId | null) => void
  toggleOverlay: () => void
  setExpandedView: (open: boolean, provider?: ProviderId | null) => void
  setTheme: (theme: ThemeName) => void
  setTier: (tier: SubscriptionTier) => void
  setProviderTier: (id: ProviderId, tier: SubscriptionTier) => void
  setActiveModel: (id: ProviderId, modelName: string, contextLimit?: number) => void
  setCacheExpiry: (id: ProviderId, expiresAt: number) => void
  checkResets: () => void
}

function safePercent(used: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

export function getHealthState(used: number, total: number): HealthState {
  if (!total || total <= 0) return 'healthy'
  const pct = used / total
  if (pct >= 1.0) return 'over_limit'
  if (pct >= 0.8) return 'near_limit'
  return 'healthy'
}

export function getSessionPercent(state: ProviderState): number {
  return safePercent(state.sessionUsage.used, state.sessionUsage.total)
}

export function getWeeklyPercent(state: ProviderState): number {
  return safePercent(state.weeklyUsage.used, state.weeklyUsage.total)
}

export function getRemaining(state: ProviderState, type: 'session' | 'weekly'): number {
  const period = type === 'session' ? state.sessionUsage : state.weeklyUsage
  return Math.max(0, period.total - period.used)
}

export function getProviderHealth(state: ProviderState): HealthState {
  return getHealthState(state.sessionUsage.used, state.sessionUsage.total)
}

export function buildMiniChartData(state: ProviderState): number[] {
  return state.history.map(p => p.sessionPercent)
}

function appendHistory(history: HistoryPoint[], point: HistoryPoint): HistoryPoint[] {
  const next = [...history, point]
  if (next.length > MAX_HISTORY_POINTS) next.shift()
  return next
}

function defaultSession(id: ProviderId): UsagePeriod {
  return { used: 0, total: SESSION_LIMIT[id], remaining: SESSION_LIMIT[id], resetAt: Date.now() + SESSION_RESET_MS[id] }
}

function defaultWeekly(id: ProviderId): UsagePeriod {
  return { used: 0, total: WEEKLY_LIMIT[id], remaining: WEEKLY_LIMIT[id], resetAt: Date.now() + 7 * 24 * 60 * 60 * 1_000 }
}

const DEFAULT_MODEL_NAMES: Record<ProviderId, string> = {
  chatgpt: 'GPT-4o',
  claude: 'Claude 3.5 Sonnet',
  gemini: 'Gemini 2.0 Flash',
  grok: 'Grok 2',
  perplexity: 'Sonar Pro',
  deepseek: 'DeepSeek V3',
  meta: 'Meta AI Muse',
}

function defaultProvider(id: ProviderId, tier: SubscriptionTier = 'pro'): ProviderState {
  const mult = TIER_MULTIPLIERS[tier] ?? 1.0
  const sessionTotal = Math.round((SESSION_LIMIT[id] ?? 30_000) * mult)
  const weeklyTotal = Math.round((WEEKLY_LIMIT[id] ?? 150_000) * mult)
  return {
    id, totalTokens: 0, inputTokens: 0, outputTokens: 0, messageCount: 0,
    sessionUsage: { used: 0, total: sessionTotal, remaining: sessionTotal, resetAt: Date.now() + (SESSION_RESET_MS[id] ?? 24 * 3600 * 1000) },
    weeklyUsage: { used: 0, total: weeklyTotal, remaining: weeklyTotal, resetAt: Date.now() + 7 * 24 * 60 * 60 * 1_000 },
    cacheExpiresAt: 0, lastActiveAt: 0, isActive: false, history: [],
    contextTokens: 0, contextLimit: CONTEXT_WINDOW_LIMITS[id] ?? 128_000,
    tier,
    activeModel: DEFAULT_MODEL_NAMES[id] ?? 'AI Model',
  }
}

function makeDefaultProviders(): Record<ProviderId, ProviderState> {
  return Object.fromEntries(ALL_PROVIDERS.map(id => [id, defaultProvider(id)])) as Record<ProviderId, ProviderState>
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

function scheduleWrite(getState: () => TraceStore) {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(async () => {
    writeTimer = null
    if (!isContextValid()) return
    try { await chrome.storage.local.set({ trace_state: getState().providers, trace_theme: getState().currentTheme }) }
    catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.warn('[Trace Store] write failed:', err)
    }
  }, 1_500)
}

export const useTraceStore = create<TraceStore>((set, get) => ({
  providers: makeDefaultProviders(),
  activeProvider: null,
  overlayOpen: false,
  expandedView: false,
  expandedProvider: null,
  currentTheme: 'catppuccin',
  currentTier: 'pro',
  lastAnalyticsAt: 0,

  init: async () => {
    await get().loadFromStorage()
    if (!isContextValid()) return
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.trace_state) {
          const nextState = changes.trace_state.newValue as Record<ProviderId, ProviderState>
          if (nextState) {
            set({ providers: nextState })
          }
        }
      })
    } catch (e) {
      if (e instanceof Error && e.message.includes('context invalidated')) return
      console.warn('[Trace Store] onChanged listener failed:', e)
    }
  },

  loadFromStorage: async () => {
    if (!isContextValid()) return
    try {
      const result = await chrome.storage.local.get(['trace_state', 'trace_theme'])
      const savedTheme = (result.trace_theme as ThemeName) || 'catppuccin'
      if (!result.trace_state) {
        set({ currentTheme: savedTheme })
        return
      }
      const saved = result.trace_state as Record<ProviderId, Partial<ProviderState>>
      const now = Date.now()
      const merged = Object.fromEntries(
        ALL_PROVIDERS.map(id => {
          const s = saved[id]
          const def = defaultProvider(id, s?.tier || 'pro')
          if (!s) return [id, def]
          const session: UsagePeriod = s.sessionUsage ?? def.sessionUsage
          const weekly: UsagePeriod = s.weeklyUsage ?? def.weeklyUsage
          if (now > session.resetAt) Object.assign(session, defaultSession(id))
          if (now > weekly.resetAt) Object.assign(weekly, defaultWeekly(id))
          const restored: ProviderState = {
            ...def, ...s, sessionUsage: session, weeklyUsage: weekly,
            isActive: false, history: (s.history ?? []).slice(-MAX_HISTORY_POINTS),
            contextTokens: s.contextTokens ?? 0,
            contextLimit: s.contextLimit ?? CONTEXT_WINDOW_LIMITS[id] ?? 128_000,
            tier: s.tier || 'pro',
            activeModel: s.activeModel || DEFAULT_MODEL_NAMES[id],
          }
          return [id, restored]
        })
      ) as Record<ProviderId, ProviderState>
      set({ providers: merged, currentTheme: savedTheme })
    } catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.error('[Trace Store] load failed:', err)
    }
  },

  persistToStorage: async () => {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null }
    if (!isContextValid()) return
    try { await chrome.storage.local.set({ trace_state: get().providers, trace_theme: get().currentTheme }) }
    catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.warn('[Trace Store] persist failed:', err)
    }
  },

  addTokens: (id, total, input = 0, output = 0) => {
    if (total <= 0 && input <= 0 && output <= 0) return
    const tokens = total || input + output
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const now = Date.now()
      const session = { ...p.sessionUsage }
      const weekly = { ...p.weeklyUsage }
      if (now > session.resetAt) Object.assign(session, defaultSession(id))
      if (now > weekly.resetAt) Object.assign(weekly, defaultWeekly(id))
      session.used = session.used + tokens
      session.remaining = Math.max(0, session.total - session.used)
      weekly.used = weekly.used + tokens
      weekly.remaining = Math.max(0, weekly.total - weekly.used)
      const updated: ProviderState = {
        ...p,
        totalTokens: p.totalTokens + tokens,
        inputTokens: p.inputTokens + input,
        outputTokens: p.outputTokens + output,
        messageCount: p.messageCount + 1,
        lastActiveAt: now,
        sessionUsage: session,
        weeklyUsage: weekly,
        contextTokens: (p.contextTokens || 0) + tokens,
        cacheExpiresAt: now + 5 * 60 * 1000,
      }
      return { providers: { ...state.providers, [id]: updated } }
    })
    scheduleWrite(get)
  },

  refreshAnalytics: (id) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const point: HistoryPoint = {
        timestamp: Date.now(),
        sessionPercent: getSessionPercent(p),
        weeklyPercent: getWeeklyPercent(p),
      }
      const updated: ProviderState = { ...p, history: appendHistory(p.history, point) }
      return { providers: { ...state.providers, [id]: updated }, lastAnalyticsAt: Date.now() }
    })
    scheduleWrite(get)
  },

  updateUsage: (id, delta) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      return { providers: { ...state.providers, [id]: { ...p, ...delta } } }
    })
    scheduleWrite(get)
  },

  setExactUsage: (id, sessionPct, weeklyPct, resetAtMs) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const session = { ...p.sessionUsage }
      const weekly = { ...p.weeklyUsage }
      if (sessionPct != null) {
        session.used = Math.round((sessionPct / 100) * session.total)
        session.remaining = Math.max(0, session.total - session.used)
      }
      if (weeklyPct != null) {
        weekly.used = Math.round((weeklyPct / 100) * weekly.total)
        weekly.remaining = Math.max(0, weekly.total - weekly.used)
      }
      if (resetAtMs != null) {
        session.resetAt = resetAtMs
      }
      return { providers: { ...state.providers, [id]: { ...p, sessionUsage: session, weeklyUsage: weekly } } }
    })
    scheduleWrite(get)
  },

  setCacheExpiry: (id, expiresAt) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      return { providers: { ...state.providers, [id]: { ...p, cacheExpiresAt: expiresAt } } }
    })
    scheduleWrite(get)
  },

  setActiveProvider: (id) => set({ activeProvider: id }),
  toggleOverlay: () => set(s => ({ overlayOpen: !s.overlayOpen })),
  setExpandedView: (open, provider = null) => set({ expandedView: open, expandedProvider: provider ?? null }),
  setTheme: (theme) => {
    set({ currentTheme: theme })
    scheduleWrite(get)
  },
  setTier: (tier) => {
    set({ currentTier: tier })
    ALL_PROVIDERS.forEach(id => get().setProviderTier(id, tier))
  },
  setProviderTier: (id, tier) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const mult = TIER_MULTIPLIERS[tier] ?? 1.0
      const newSessionTotal = Math.round((SESSION_LIMIT[id] ?? 30_000) * mult)
      const newWeeklyTotal = Math.round((WEEKLY_LIMIT[id] ?? 150_000) * mult)
      const updated: ProviderState = {
        ...p,
        tier,
        sessionUsage: { ...p.sessionUsage, total: newSessionTotal, remaining: Math.max(0, newSessionTotal - p.sessionUsage.used) },
        weeklyUsage: { ...p.weeklyUsage, total: newWeeklyTotal, remaining: Math.max(0, newWeeklyTotal - p.weeklyUsage.used) },
      }
      return { providers: { ...state.providers, [id]: updated } }
    })
    scheduleWrite(get)
  },
  setActiveModel: (id, modelName, contextLimit) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const updated: ProviderState = {
        ...p,
        activeModel: modelName,
        contextLimit: contextLimit ?? p.contextLimit,
      }
      return { providers: { ...state.providers, [id]: updated } }
    })
    scheduleWrite(get)
  },
  checkResets: () => {
    const now = Date.now()
    let changed = false
    const providers = { ...get().providers }
    ALL_PROVIDERS.forEach(id => {
      const p = providers[id]
      let session = { ...p.sessionUsage }
      let weekly = { ...p.weeklyUsage }
      let providerChanged = false
      if (now > session.resetAt) {
        session = defaultSession(id)
        providerChanged = true
      }
      if (now > weekly.resetAt) {
        weekly = defaultWeekly(id)
        providerChanged = true
      }
      if (providerChanged) {
        providers[id] = { ...p, sessionUsage: session, weeklyUsage: weekly }
        changed = true
      }
    })
    if (changed) {
      set({ providers })
      get().persistToStorage()
    }
  },
}))

let engineTimer: ReturnType<typeof setInterval> | null = null

export function startAnalyticsEngine() {
  if (engineTimer) return
  engineTimer = setInterval(() => {
    if (!isContextValid()) {
      stopAnalyticsEngine()
      return
    }
    const store = useTraceStore.getState()
    store.checkResets()
    ALL_PROVIDERS.forEach(id => store.refreshAnalytics(id))
  }, ANALYTICS_REFRESH_INTERVAL)
}

export function stopAnalyticsEngine() {
  if (!engineTimer) return
  clearInterval(engineTimer)
  engineTimer = null
}
