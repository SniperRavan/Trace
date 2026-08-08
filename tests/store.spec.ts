import { describe, it, expect } from 'vitest'
import {
  useTraceStore,
  getObservedTokens,
  getContextPercent,
  getQuotaDisplay,
  type UsageRecord,
} from '../src/storage/store'

describe('Trace Store & Observability Engine', () => {
  it('should initialize with default provider states and PlanPolicies', () => {
    const state = useTraceStore.getState()
    expect(state.providers.chatgpt).toBeDefined()
    expect(state.providers.chatgpt.planPolicy.quotaKind).toBe('messages')
    expect(state.providers.claude.planPolicy.quotaKind).toBe('compute')
    expect(state.providers.gemini.planPolicy.quotaKind).toBe('compute')
  })

  it('should record usage and distinguish server exact vs local estimate', () => {
    const store = useTraceStore.getState()

    // 1. Record an exact server record
    const serverRecord: UsageRecord = {
      provider: 'claude',
      model: 'Claude 3.5 Sonnet',
      inputTokens: 200,
      outputTokens: 500,
      cachedInputTokens: 100,
      totalTokens: 700,
      source: 'server',
      confidence: 'exact',
      observedAt: Date.now(),
    }
    store.recordUsage(serverRecord, 'event-101')

    const claudeState = useTraceStore.getState().providers.claude
    expect(claudeState.serverTokens).toBe(700)
    expect(claudeState.observedTokens).toBe(700)
    expect(claudeState.contextTokens).toBe(700)

    const quota = getQuotaDisplay(claudeState)
    expect(quota.isExact).toBe(true)
    expect(quota.description).toContain('Server reported')
  })

  it('should deduplicate events with the same eventId (Idempotency)', () => {
    const store = useTraceStore.getState()
    const duplicateRecord: UsageRecord = {
      provider: 'chatgpt',
      model: 'GPT-4o',
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      source: 'tokenizer',
      confidence: 'estimated',
      observedAt: Date.now(),
    }

    const appliedFirst = store.recordUsage(duplicateRecord, 'event-dup-999')
    expect(appliedFirst).toBe(true)

    const tokensAfterFirst = useTraceStore.getState().providers.chatgpt.observedTokens

    // Try replaying the exact same event
    const appliedSecond = store.recordUsage(duplicateRecord, 'event-dup-999')
    expect(appliedSecond).toBe(false)

    // Token count should NOT increase
    const tokensAfterSecond = useTraceStore.getState().providers.chatgpt.observedTokens
    expect(tokensAfterSecond).toBe(tokensAfterFirst)
  })

  it('should reset context load when rolling window expires', () => {
    const store = useTraceStore.getState()

    // Simulate an expired session window on Gemini
    store.setPlanPolicy('gemini', {
      windows: [
        { name: 'session', resetAt: Date.now() - 2000, isDynamic: true },
        { name: 'weekly', resetAt: Date.now() + 50000, isDynamic: true },
      ],
    })
    store.updateUsage('gemini', { contextTokens: 45000 })

    expect(useTraceStore.getState().providers.gemini.contextTokens).toBe(45000)

    store.checkResets()

    const geminiAfter = useTraceStore.getState().providers.gemini
    expect(geminiAfter.contextTokens).toBe(0)
    const newSessionWin = geminiAfter.planPolicy.windows.find(w => w.name === 'session')
    expect(newSessionWin?.resetAt).toBeGreaterThan(Date.now())
  })

  it('should export and import data with deduplication', () => {
    const store = useTraceStore.getState()
    store.recordUsage({
      provider: 'gemini',
      inputTokens: 500,
      outputTokens: 500,
      totalTokens: 1000,
      source: 'server',
      confidence: 'exact',
      observedAt: Date.now(),
    }, 'event-import-1')

    const exportedJson = JSON.stringify({
      version: '2.0',
      providers: useTraceStore.getState().providers,
    })

    const importResult = store.importDataFromJSON(exportedJson)
    expect(importResult.success).toBe(true)
    expect(importResult.importedCount).toBe(3)
  })
})
