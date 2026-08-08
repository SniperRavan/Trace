/*
 * src/storage/store.ts
 *
 * Trace State Management & Observability Store.
 * 
 * Core Design & Release Gates:
 * - Separates Observed Tokens (server vs estimated) from Provider Quotas (dynamic/unavailable)
 * - Multi-token classification (input, output, reasoning, cached)
 * - Idempotent event processing via SHA-256 eventId deduplication
 * - Schema versioning (v2.0) and backwards-compatible storage migration
 * - Independent per-provider feature flags / adapter toggles
 * - 100% local-first storage with guarded JSON import/export and zero prompt retention
 */

import { create } from 'zustand'

export const SCHEMA_VERSION = 2
export const ANALYTICS_REFRESH_INTERVAL = 60_000
export const MAX_HISTORY_POINTS = 60
export const MAX_SEEN_EVENTS = 500
export const MAX_IMPORT_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id
  } catch {
    return false
  }
}

export type ProviderId = 'chatgpt' | 'claude' | 'gemini'
export type HealthState = 'healthy' | 'near_limit' | 'over_limit'
export type ThemeName = 'catppuccin' | 'nord' | 'tokyonight' | 'gruvbox' | 'dracula' | 'everforest' | 'liquidglass'
export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise'

export type TokenSource = 'server' | 'tokenizer' | 'heuristic'
export type TokenConfidence = 'exact' | 'estimated' | 'unknown'
export type QuotaKind = 'messages' | 'compute' | 'tokens' | 'unknown'

export interface ResetWindow {
  name: 'session' | 'daily' | 'weekly' | 'monthly'
  resetAt?: number
  limit?: number
  unit?: string
  observedUsed?: number
  isDynamic?: boolean
}

export interface PlanPolicy {
  provider: ProviderId
  planId: string
  displayName: string
  quotaKind: QuotaKind
  windows: ResetWindow[]
  source: 'provider-ui' | 'provider-response' | 'user-configured'
  observedAt: number
}

export interface UsageRecord {
  provider: ProviderId
  accountKey?: string
  conversationId?: string
  model?: string
  plan?: string
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
  totalTokens?: number
  source: TokenSource
  confidence: TokenConfidence
  observedAt: number
}

export interface AdapterHealth {
  lastSuccessfulParse: number
  lastFailureReason?: string
  consecutiveFailures: number
  protocolVersion: string
  status: 'operational' | 'degraded' | 'needs_review'
}

export interface ProviderState {
  id: ProviderId
  enabled: boolean
  observedTokens: number
  serverTokens: number
  estimatedTokens: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cachedInputTokens: number
  totalTokens: number
  messageCount: number
  lastRecord?: UsageRecord
  planPolicy: PlanPolicy
  contextTokens: number
  contextLimit: number
  tier: SubscriptionTier
  activeModel: string
  lastActiveAt: number
  cacheExpiresAt: number
  isActive: boolean
  history: HistoryPoint[]
  seenEventIds: string[]
  adapterHealth: AdapterHealth
  // Legacy session fields maintained for backwards UI compatibility
  sessionUsage: {
    used: number
    total: number
    remaining: number
    resetAt: number
  }
  weeklyUsage: {
    used: number
    total: number
    remaining: number
    resetAt: number
  }
}

export const ALL_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini']

export const PROVIDER_IDENTITY: Record<ProviderId, { letter: string; color: string; name: string }> = {
  chatgpt: { letter: 'G', color: '#10b981', name: 'ChatGPT' },
  claude: { letter: 'C', color: '#f59e0b', name: 'Claude' },
  gemini: { letter: 'M', color: '#818cf8', name: 'Gemini' },
}

export const CONTEXT_WINDOW_LIMITS: Record<ProviderId, number> = {
  chatgpt: 128_000,
  claude: 200_000,
  gemini: 1_000_000,
}

export const TIER_MULTIPLIERS: Record<SubscriptionTier, number> = {
  free: 0.5,
  pro: 1.0,
  team: 2.5,
  enterprise: 5.0,
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  chatgpt: 'GPT-4o',
  claude: 'Claude 3.5 Sonnet',
  gemini: '3.6 Flash',
}

const DEFAULT_RESET_MS: Record<ProviderId, number> = {
  chatgpt: 3 * 3600 * 1000, // 3h rolling reset
  claude: 5 * 3600 * 1000,  // 5h rolling compute window
  gemini: 5 * 3600 * 1000,  // 5h rolling compute window
}

export function defaultPlanPolicy(id: ProviderId, tier: SubscriptionTier = 'pro'): PlanPolicy {
  const isChatGPT = id === 'chatgpt'
  const isClaude = id === 'claude'
  const isGemini = id === 'gemini'

  let quotaKind: QuotaKind = 'compute'
  if (isChatGPT) quotaKind = 'messages'
  if (isClaude || isGemini) quotaKind = 'compute'

  const resetMs = DEFAULT_RESET_MS[id] ?? 5 * 3600 * 1000
  const now = Date.now()

  return {
    provider: id,
    planId: tier,
    displayName: `${PROVIDER_IDENTITY[id]?.name || id} ${tier.toUpperCase()}`,
    quotaKind,
    windows: [
      {
        name: 'session',
        resetAt: now + resetMs,
        isDynamic: true,
        unit: quotaKind === 'messages' ? 'msgs' : 'compute',
      },
      {
        name: 'weekly',
        resetAt: now + 7 * 24 * 3600 * 1000,
        isDynamic: true,
        unit: 'quota',
      },
    ],
    source: 'provider-response',
    observedAt: now,
  }
}

export function defaultProvider(id: ProviderId, tier: SubscriptionTier = 'pro'): ProviderState {
  const policy = defaultPlanPolicy(id, tier)
  const sessionReset = policy.windows.find(w => w.name === 'session')?.resetAt ?? (Date.now() + 5 * 3600 * 1000)
  const weeklyReset = policy.windows.find(w => w.name === 'weekly')?.resetAt ?? (Date.now() + 7 * 24 * 3600 * 1000)

  return {
    id,
    enabled: true,
    observedTokens: 0,
    serverTokens: 0,
    estimatedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 0,
    messageCount: 0,
    planPolicy: policy,
    contextTokens: 0,
    contextLimit: CONTEXT_WINDOW_LIMITS[id] ?? 128_000,
    tier,
    activeModel: DEFAULT_MODELS[id] ?? 'AI Model',
    lastActiveAt: 0,
    cacheExpiresAt: 0,
    isActive: false,
    history: [],
    seenEventIds: [],
    adapterHealth: {
      lastSuccessfulParse: Date.now(),
      consecutiveFailures: 0,
      protocolVersion: '2.0',
      status: 'operational',
    },
    sessionUsage: {
      used: 0,
      total: 40_000,
      remaining: 40_000,
      resetAt: sessionReset,
    },
    weeklyUsage: {
      used: 0,
      total: 200_000,
      remaining: 200_000,
      resetAt: weeklyReset,
    },
  }
}

export function makeDefaultProviders(): Record<ProviderId, ProviderState> {
  return Object.fromEntries(ALL_PROVIDERS.map(id => [id, defaultProvider(id)])) as Record<ProviderId, ProviderState>
}

// ── Schema Migration Runner ───────────────────────────────────────────────────

export function migrateStorage(raw: any): Record<ProviderId, ProviderState> {
  const result = makeDefaultProviders()
  if (!raw || typeof raw !== 'object') return result

  ALL_PROVIDERS.forEach(id => {
    const s = raw[id]
    if (s && typeof s === 'object') {
      const def = defaultProvider(id, s.tier || 'pro')
      result[id] = {
        ...def,
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        observedTokens: Number(s.observedTokens ?? s.totalTokens ?? 0),
        serverTokens: Number(s.serverTokens ?? 0),
        estimatedTokens: Number(s.estimatedTokens ?? 0),
        inputTokens: Number(s.inputTokens ?? 0),
        outputTokens: Number(s.outputTokens ?? 0),
        reasoningTokens: Number(s.reasoningTokens ?? 0),
        cachedInputTokens: Number(s.cachedInputTokens ?? 0),
        totalTokens: Number(s.totalTokens ?? 0),
        contextTokens: Number(s.contextTokens ?? 0),
        contextLimit: Number(s.contextLimit ?? CONTEXT_WINDOW_LIMITS[id] ?? 128_000),
        activeModel: s.activeModel || DEFAULT_MODELS[id],
        tier: s.tier || 'pro',
        planPolicy: s.planPolicy || def.planPolicy,
        seenEventIds: Array.isArray(s.seenEventIds) ? s.seenEventIds.slice(-MAX_SEEN_EVENTS) : [],
        history: Array.isArray(s.history) ? s.history.slice(-MAX_HISTORY_POINTS) : [],
        adapterHealth: s.adapterHealth || def.adapterHealth,
      }
    }
  })

  return result
}

// ── Observation and Quota Helpers ──────────────────────────────────────────

export function getObservedTokens(state: ProviderState): number {
  return state.observedTokens || state.totalTokens || (state.inputTokens + state.outputTokens)
}

export function getContextPercent(state: ProviderState): number {
  if (!state.contextLimit || state.contextLimit <= 0) return 0
  return Math.min(100, Math.round(((state.contextTokens || 0) / state.contextLimit) * 100))
}

export function getSessionPercent(state: ProviderState): number {
  return getContextPercent(state)
}

export function getWeeklyPercent(state: ProviderState): number {
  const w = state.planPolicy?.windows?.find(w => w.name === 'weekly')
  if (!w?.resetAt) return 0
  const totalDuration = 7 * 24 * 3600 * 1000
  const elapsed = Math.max(0, totalDuration - (w.resetAt - Date.now()))
  return Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)))
}

export function getRemaining(state: ProviderState, _type?: 'session' | 'weekly'): number {
  return Math.max(0, state.contextLimit - state.contextTokens)
}

export function getHealthState(usedOrContext: number, totalOrLimit: number): HealthState {
  if (!totalOrLimit || totalOrLimit <= 0) return 'healthy'
  const pct = usedOrContext / totalOrLimit
  if (pct >= 1.0) return 'over_limit'
  if (pct >= 0.8) return 'near_limit'
  return 'healthy'
}

export function getProviderHealth(state: ProviderState): HealthState {
  return getHealthState(state.contextTokens || 0, state.contextLimit || 128_000)
}

export function getQuotaDisplay(state: ProviderState): {
  kind: QuotaKind
  description: string
  resetAt?: number
  isExact: boolean
} {
  const policy = state.planPolicy
  const sessionWin = policy?.windows?.find(w => w.name === 'session')
  const resetAt = sessionWin?.resetAt ?? state.sessionUsage?.resetAt

  if (state.lastRecord?.source === 'server' && state.lastRecord?.confidence === 'exact') {
    return {
      kind: policy?.quotaKind ?? 'compute',
      description: 'Server reported usage',
      resetAt,
      isExact: true,
    }
  }

  return {
    kind: policy?.quotaKind ?? 'compute',
    description: 'Provider controlled · Dynamic',
    resetAt,
    isExact: false,
  }
}

export function buildMiniChartData(state: ProviderState): number[] {
  return (state.history || []).map(p => Math.min(100, Math.round((p.observedTokens / 1000))))
}

export function exportDataAsJSON(providers: Record<ProviderId, ProviderState>): string {
  return JSON.stringify(
    {
      version: '2.0',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      scope: 'local-browser-profile-only',
      providers,
    },
    null,
    2
  )
}

export function exportDataAsCSV(providers: Record<ProviderId, ProviderState>): string {
  const headers = [
    'Provider',
    'Enabled',
    'Model',
    'Tier',
    'ObservedTokens',
    'ServerTokens',
    'EstimatedTokens',
    'InputTokens',
    'OutputTokens',
    'ReasoningTokens',
    'CachedInputTokens',
    'ContextTokens',
    'ContextLimit',
    'QuotaKind',
    'LastSource',
  ]
  const rows = Object.values(providers).map(p => [
    p.id,
    p.enabled ? 'true' : 'false',
    `"${p.activeModel}"`,
    p.tier,
    getObservedTokens(p),
    p.serverTokens,
    p.estimatedTokens,
    p.inputTokens,
    p.outputTokens,
    p.reasoningTokens,
    p.cachedInputTokens,
    p.contextTokens,
    p.contextLimit,
    p.planPolicy?.quotaKind ?? 'compute',
    p.lastRecord?.source ?? 'heuristic',
  ])
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
}

// ── Store Definition ────────────────────────────────────────────────────────

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
  recordUsage: (record: UsageRecord, eventId?: string) => boolean
  toggleProviderEnabled: (id: ProviderId) => void
  addTokens: (
    id: ProviderId,
    total: number,
    input?: number,
    output?: number,
    reasoning?: number,
    cached?: number,
    source?: TokenSource
  ) => void
  setPlanPolicy: (id: ProviderId, policy: Partial<PlanPolicy>) => void
  setExactUsage: (id: ProviderId, sessionPct?: number, weeklyPct?: number, resetAtMs?: number) => void
  updateUsage: (id: ProviderId, delta: Partial<ProviderState>) => void
  setActiveProvider: (id: ProviderId | null) => void
  toggleOverlay: () => void
  setExpandedView: (open: boolean, provider?: ProviderId | null) => void
  setTheme: (theme: ThemeName) => void
  setTier: (tier: SubscriptionTier) => void
  setProviderTier: (id: ProviderId, tier: SubscriptionTier) => void
  setActiveModel: (id: ProviderId, modelName: string, contextLimit?: number) => void
  reportAdapterStatus: (id: ProviderId, success: boolean, reason?: string) => void
  refreshAnalytics: (id: ProviderId) => void
  importDataFromJSON: (jsonStr: string) => { success: boolean; importedCount: number; error?: string }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

function scheduleWrite(getState: () => TraceStore) {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(async () => {
    writeTimer = null
    if (!isContextValid()) return
    try {
      await chrome.storage.local.set({
        trace_schema_version: SCHEMA_VERSION,
        trace_state: getState().providers,
        trace_theme: getState().currentTheme,
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.warn('[Trace Store] write failed:', err)
    }
  }, 150)
}

export const useTraceStore = create<TraceStore>((set, get) => ({
  providers: makeDefaultProviders(),
  activeProvider: null,
  overlayOpen: false,
  expandedView: false,
  expandedProvider: null,
  currentTheme: 'catppuccin',
  currentTier: 'free',
  lastAnalyticsAt: 0,

  init: async () => {
    await get().loadFromStorage()
    if (!isContextValid()) return
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          const updates: Partial<TraceStore> = {}
          if (changes.trace_state?.newValue) {
            updates.providers = changes.trace_state.newValue as Record<ProviderId, ProviderState>
          }
          if (changes.trace_theme?.newValue) {
            updates.currentTheme = changes.trace_theme.newValue as ThemeName
          }
          if (Object.keys(updates).length > 0) {
            set(updates)
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
      const result = await chrome.storage.local.get(['trace_state', 'trace_theme', 'trace_schema_version'])
      const savedTheme = (result.trace_theme as ThemeName) || 'catppuccin'
      if (!result.trace_state) {
        set({ currentTheme: savedTheme })
        return
      }

      // Run migration runner if schema version is older or missing
      const migrated = migrateStorage(result.trace_state)
      set({ providers: migrated, currentTheme: savedTheme })
    } catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.error('[Trace Store] load failed:', err)
    }
  },

  persistToStorage: async () => {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    if (!isContextValid()) return
    try {
      await chrome.storage.local.set({
        trace_schema_version: SCHEMA_VERSION,
        trace_state: get().providers,
        trace_theme: get().currentTheme,
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('context invalidated')) return
      console.warn('[Trace Store] persist failed:', err)
    }
  },

  toggleProviderEnabled: (id) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      return {
        providers: {
          ...state.providers,
          [id]: { ...p, enabled: !p.enabled },
        },
      }
    })
    scheduleWrite(get)
  },

  recordUsage: (record: UsageRecord, eventId?: string): boolean => {
    const id = record.provider
    if (!ALL_PROVIDERS.includes(id)) return false

    // Respect feature flag toggle: if provider is disabled, drop record
    const currentProvider = get().providers[id]
    if (currentProvider && currentProvider.enabled === false) {
      return false
    }

    let wasApplied = false
    set(state => {
      const p = state.providers[id]
      if (!p) return state

      // ── Idempotency Check ──────────────────────────────────────────────
      if (eventId && p.seenEventIds.includes(eventId)) {
        return state // Duplicate event rejected
      }

      const inTok = record.inputTokens ?? 0
      const outTok = record.outputTokens ?? 0
      const reasoningTok = record.reasoningTokens ?? 0
      const cachedTok = record.cachedInputTokens ?? 0
      const totalTok = record.totalTokens || inTok + outTok + reasoningTok

      const isServer = record.source === 'server' && record.confidence === 'exact'
      const seen = eventId ? [...p.seenEventIds, eventId].slice(-MAX_SEEN_EVENTS) : p.seenEventIds

      const nextObserved = p.observedTokens + totalTok
      const nextServer = isServer ? p.serverTokens + totalTok : p.serverTokens
      const nextEstimated = !isServer ? p.estimatedTokens + totalTok : p.estimatedTokens
      const nextContext = (p.contextTokens || 0) + inTok + outTok + reasoningTok

      const updated: ProviderState = {
        ...p,
        observedTokens: nextObserved,
        serverTokens: nextServer,
        estimatedTokens: nextEstimated,
        inputTokens: p.inputTokens + inTok,
        outputTokens: p.outputTokens + outTok,
        reasoningTokens: p.reasoningTokens + reasoningTok,
        cachedInputTokens: p.cachedInputTokens + cachedTok,
        totalTokens: p.totalTokens + totalTok,
        messageCount: p.messageCount + 1,
        contextTokens: nextContext,
        lastRecord: record,
        lastActiveAt: Date.now(),
        seenEventIds: seen,
        activeModel: record.model || p.activeModel,
      }

      wasApplied = true
      return { providers: { ...state.providers, [id]: updated } }
    })

    if (wasApplied) scheduleWrite(get)
    return wasApplied
  },

  addTokens: (id, total, input = 0, output = 0, reasoning = 0, cached = 0, source = 'heuristic') => {
    if (total <= 0 && input <= 0 && output <= 0) return
    const isExact = source === 'server'
    get().recordUsage({
      provider: id,
      totalTokens: total || input + output + reasoning,
      inputTokens: input,
      outputTokens: output,
      reasoningTokens: reasoning,
      cachedInputTokens: cached,
      source,
      confidence: isExact ? 'exact' : 'estimated',
      observedAt: Date.now(),
    })
  },

  setPlanPolicy: (id, policyDelta) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const updatedPolicy: PlanPolicy = { ...p.planPolicy, ...policyDelta, observedAt: Date.now() }
      return {
        providers: {
          ...state.providers,
          [id]: { ...p, planPolicy: updatedPolicy },
        },
      }
    })
    scheduleWrite(get)
  },

  setExactUsage: (id, sessionPct, weeklyPct, resetAtMs) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state

      const policy = { ...p.planPolicy }
      const windows = [...(policy.windows || [])]

      if (resetAtMs != null) {
        const sWin = windows.find(w => w.name === 'session')
        if (sWin) sWin.resetAt = resetAtMs
        else windows.push({ name: 'session', resetAt: resetAtMs, isDynamic: true })
      }

      return {
        providers: {
          ...state.providers,
          [id]: {
            ...p,
            planPolicy: { ...policy, windows },
            sessionUsage: {
              ...p.sessionUsage,
              resetAt: resetAtMs ?? p.sessionUsage.resetAt,
            },
          },
        },
      }
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

  setActiveProvider: (id) => {
    set(state => {
      const updated = { ...state.providers }
      ALL_PROVIDERS.forEach(pId => {
        if (updated[pId]) {
          updated[pId] = { ...updated[pId], isActive: pId === id }
        }
      })
      return { activeProvider: id, expandedProvider: id, providers: updated }
    })
    scheduleWrite(get)
  },

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
      const newSessionTotal = Math.round((40_000) * mult)
      const newWeeklyTotal = Math.round((200_000) * mult)
      const updatedPolicy: PlanPolicy = {
        ...p.planPolicy,
        planId: tier,
        displayName: `${PROVIDER_IDENTITY[id]?.name || id} ${tier.toUpperCase()}`,
      }
      return {
        providers: {
          ...state.providers,
          [id]: {
            ...p,
            tier,
            planPolicy: updatedPolicy,
            sessionUsage: { ...p.sessionUsage, total: newSessionTotal, remaining: Math.max(0, newSessionTotal - p.sessionUsage.used) },
            weeklyUsage: { ...p.weeklyUsage, total: newWeeklyTotal, remaining: Math.max(0, newWeeklyTotal - p.weeklyUsage.used) },
          },
        },
      }
    })
    scheduleWrite(get)
  },

  setActiveModel: (id, modelName, contextLimit) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      return {
        providers: {
          ...state.providers,
          [id]: {
            ...p,
            activeModel: modelName,
            contextLimit: contextLimit ?? p.contextLimit,
          },
        },
      }
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

  checkResets: () => {
    const now = Date.now()
    let changed = false
    const providers = { ...get().providers }

    ALL_PROVIDERS.forEach(id => {
      const p = providers[id]
      const windows = [...(p.planPolicy?.windows || [])]
      let winChanged = false

      windows.forEach(w => {
        if (w.resetAt && now > w.resetAt) {
          const resetInterval = w.name === 'session' ? DEFAULT_RESET_MS[id] : 7 * 24 * 3600 * 1000
          w.resetAt = now + resetInterval
          winChanged = true
        }
      })

      if (winChanged) {
        providers[id] = {
          ...p,
          contextTokens: 0, // Reset conversation context load upon window reset
          planPolicy: { ...p.planPolicy, windows },
        }
        changed = true
      }
    })

    if (changed) {
      set({ providers })
      get().persistToStorage()
    }
  },

  reportAdapterStatus: (id, success, reason) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const current = p.adapterHealth || {
        lastSuccessfulParse: Date.now(),
        consecutiveFailures: 0,
        protocolVersion: '2.0',
        status: 'operational',
      }
      let updated: AdapterHealth
      if (success) {
        updated = {
          ...current,
          lastSuccessfulParse: Date.now(),
          consecutiveFailures: 0,
          lastFailureReason: undefined,
          status: 'operational',
        }
      } else {
        const failures = current.consecutiveFailures + 1
        updated = {
          ...current,
          consecutiveFailures: failures,
          lastFailureReason: reason || 'Schema mismatch or stream interruption',
          status: failures >= 3 ? 'needs_review' : 'degraded',
        }
      }
      return {
        providers: {
          ...state.providers,
          [id]: { ...p, adapterHealth: updated },
        },
      }
    })
    scheduleWrite(get)
  },

  refreshAnalytics: (id) => {
    set(state => {
      const p = state.providers[id]
      if (!p) return state
      const point: HistoryPoint = {
        timestamp: Date.now(),
        observedTokens: getObservedTokens(p),
        contextTokens: p.contextTokens || 0,
        serverExact: p.lastRecord?.source === 'server',
      }
      const updatedHistory = [...(p.history || []), point].slice(-MAX_HISTORY_POINTS)
      return {
        providers: {
          ...state.providers,
          [id]: { ...p, history: updatedHistory },
        },
        lastAnalyticsAt: Date.now(),
      }
    })
    scheduleWrite(get)
  },

  importDataFromJSON: (jsonStr: string) => {
    try {
      // 1. File size guard (2MB max)
      if (jsonStr.length > MAX_IMPORT_SIZE_BYTES) {
        return { success: false, importedCount: 0, error: 'File exceeds 2MB size limit' }
      }

      // 2. Schema parse & validation
      const parsed = JSON.parse(jsonStr)
      const importedProviders = parsed.providers
      if (!importedProviders || typeof importedProviders !== 'object') {
        return { success: false, importedCount: 0, error: 'Invalid format: missing providers object' }
      }

      const clampNum = (n: any, max = 100_000_000) => {
        if (typeof n !== 'number' || isNaN(n) || !isFinite(n) || n < 0) return 0
        return Math.min(n, max)
      }

      let count = 0
      set(state => {
        const merged = { ...state.providers }
        ALL_PROVIDERS.forEach(id => {
          const imp = importedProviders[id]
          if (imp && typeof imp === 'object') {
            const current = merged[id] || defaultProvider(id)
            const combinedSeen = Array.from(new Set([...current.seenEventIds, ...(Array.isArray(imp.seenEventIds) ? imp.seenEventIds : [])])).slice(-MAX_SEEN_EVENTS)
            
            merged[id] = {
              ...current,
              observedTokens: Math.max(current.observedTokens, clampNum(imp.observedTokens)),
              serverTokens: Math.max(current.serverTokens, clampNum(imp.serverTokens)),
              estimatedTokens: Math.max(current.estimatedTokens, clampNum(imp.estimatedTokens)),
              inputTokens: Math.max(current.inputTokens, clampNum(imp.inputTokens)),
              outputTokens: Math.max(current.outputTokens, clampNum(imp.outputTokens)),
              reasoningTokens: Math.max(current.reasoningTokens, clampNum(imp.reasoningTokens)),
              cachedInputTokens: Math.max(current.cachedInputTokens, clampNum(imp.cachedInputTokens)),
              totalTokens: Math.max(current.totalTokens, clampNum(imp.totalTokens)),
              seenEventIds: combinedSeen,
            }
            count++
          }
        })
        return { providers: merged }
      })

      scheduleWrite(get)
      return { success: true, importedCount: count }
    } catch (err) {
      return { success: false, importedCount: 0, error: err instanceof Error ? err.message : 'JSON parse error' }
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
