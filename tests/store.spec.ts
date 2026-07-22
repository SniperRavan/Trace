import { describe, it, expect, vi } from 'vitest'
import { useTraceStore, getSessionPercent, getWeeklyPercent } from '../src/storage/store'

describe('Trace Store', () => {
  it('should initialize with default provider states', () => {
    const state = useTraceStore.getState()
    expect(state.providers.chatgpt).toBeDefined()
    expect(state.providers.chatgpt.sessionUsage.total).toBe(40000)
    expect(state.providers.claude.sessionUsage.total).toBe(45000)
  })

  it('should add tokens and decrease remaining quota', () => {
    const store = useTraceStore.getState()
    store.addTokens('chatgpt', 1000, 400, 600)
    
    const updated = useTraceStore.getState().providers.chatgpt
    expect(updated.totalTokens).toBe(1000)
    expect(updated.sessionUsage.used).toBe(1000)
    expect(updated.sessionUsage.remaining).toBe(39000)
  })

  it('should calculate correct usage percentages', () => {
    const state = useTraceStore.getState().providers.chatgpt
    // used = 1000, total = 40000 => 2.5%, rounded to 3%
    expect(getSessionPercent(state)).toBe(3)
  })

  it('should clear limits when reset check expires', () => {
    const store = useTraceStore.getState()
    
    // Artificially modify store memory to be expired and have usage
    store.updateUsage('chatgpt', {
      sessionUsage: {
        used: 5000,
        total: 40000,
        remaining: 35000,
        resetAt: Date.now() - 1000 // Expired 1s ago
      }
    })

    // Before check, session has 5000 used
    expect(useTraceStore.getState().providers.chatgpt.sessionUsage.used).toBe(5000)
    
    // Trigger reset check
    store.checkResets()

    // Session usage should be zeroed and resetAt should be pushed to the future
    const reset = useTraceStore.getState().providers.chatgpt.sessionUsage
    expect(reset.used).toBe(0)
    expect(reset.resetAt).toBeGreaterThan(Date.now())
  })

  it('should set per-provider tier without mutating other providers', () => {
    const store = useTraceStore.getState()
    store.setProviderTier('claude', 'team')

    expect(useTraceStore.getState().providers.claude.tier).toBe('team')
    expect(useTraceStore.getState().providers.chatgpt.tier).toBe('pro')
  })

  it('should update active model name and context limit', () => {
    const store = useTraceStore.getState()
    store.setActiveModel('deepseek', 'DeepSeek R1', 128000)

    const deepseekState = useTraceStore.getState().providers.deepseek
    expect(deepseekState.activeModel).toBe('DeepSeek R1')
    expect(deepseekState.contextLimit).toBe(128000)
  })
})
