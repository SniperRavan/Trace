import { describe, it, expect, vi } from 'vitest'
import { countTokens, estimateTokens, formatTokens, formatResetTime } from '../src/tracking/estimator'
import { useTraceStore, CONTEXT_WINDOW_LIMITS, TIER_MULTIPLIERS, ALL_PROVIDERS, type SubscriptionTier } from '../src/storage/store'
import { listenForTraceEvents, TRACE_MARKER } from '../src/content/adapters'

describe('Automated Verification Suite for Trace', () => {

  describe('1. Token Estimator Unit Tests', () => {
    const testCases = [
      { input: 'Hello world', minExpected: 1 },
      { input: '', expected: 0 },
      { input: 'Hello! How are you today?', minExpected: 3 },
      { input: 'The quick brown fox jumps over the lazy dog', minExpected: 7 },
      { input: '🚀 Emoji test', minExpected: 2 },
      { input: 'Café résumé naïve', minExpected: 3 },
      { input: '```python\ndef hello():\n    print("world")\n```', minExpected: 8 },
    ]

    testCases.forEach(({ input, expected, minExpected }) => {
      it(`should correctly estimate tokens for "${input.slice(0, 20)}..."`, () => {
        const result = countTokens(input)
        if (expected !== undefined) {
          expect(result).toBe(expected)
        } else if (minExpected !== undefined) {
          expect(result).toBeGreaterThanOrEqual(minExpected)
        }
      })
    })

    it('should calculate prompt + response estimate correctly', () => {
      const prompt = 'Explain quantum computing in simple terms.'
      const promptTokens = countTokens(prompt)
      const totalEstimated = estimateTokens(prompt)
      // estimateTokens returns prompt + Math.ceil(prompt * 2.5)
      expect(totalEstimated).toBe(promptTokens + Math.ceil(promptTokens * 2.5))
    })
  })

  describe('2. Provider Context Limits', () => {
    const expectedLimits = {
      chatgpt: 128_000,
      claude: 200_000,
      gemini: 1_000_000,
    }

    ALL_PROVIDERS.forEach(id => {
      it(`should enforce ${id} context limit of ${expectedLimits[id]} tokens`, () => {
        expect(CONTEXT_WINDOW_LIMITS[id]).toBe(expectedLimits[id])
      })
    })
  })

  describe('3. Tier Preset Scaling', () => {
    const tiers: { id: SubscriptionTier; multiplier: number }[] = [
      { id: 'free', multiplier: 0.5 },
      { id: 'pro', multiplier: 1.0 },
      { id: 'team', multiplier: 2.5 },
      { id: 'enterprise', multiplier: 5.0 },
    ]

    tiers.forEach(({ id, multiplier }) => {
      it(`should scale session/weekly quota for ${id} tier (${multiplier}x)`, () => {
        const store = useTraceStore.getState()
        store.setProviderTier('chatgpt', id)
        const chatgptState = useTraceStore.getState().providers.chatgpt
        
        const baseSession = 40_000
        const baseWeekly = 200_000
        expect(chatgptState.sessionUsage.total).toBe(Math.round(baseSession * multiplier))
        expect(chatgptState.weeklyUsage.total).toBe(Math.round(baseWeekly * multiplier))
      })
    })
  })

  describe('4. Rate Limit Expiration & Reset Handling', () => {
    it('should reset session and weekly usage when resetAt timestamp is passed', () => {
      const store = useTraceStore.getState()
      
      // Add usage to ChatGPT
      store.addTokens('chatgpt', 5000, 2000, 3000)
      expect(useTraceStore.getState().providers.chatgpt.sessionUsage.used).toBe(5000)

      // Expire session resetAt
      store.updateUsage('chatgpt', {
        sessionUsage: {
          used: 5000,
          total: 40000,
          remaining: 35000,
          resetAt: Date.now() - 5000,
        }
      })

      // Run checkResets
      store.checkResets()
      const resetState = useTraceStore.getState().providers.chatgpt
      expect(resetState.sessionUsage.used).toBe(0)
      expect(resetState.sessionUsage.resetAt).toBeGreaterThan(Date.now())
    })
  })

  describe('5. Cross-World Message Bridge', () => {
    it('should listen for trace:tokens CustomEvent and postMessage events', () => {
      const callback = vi.fn()
      const cleanup = listenForTraceEvents('chatgpt', callback)

      const payload = {
        provider: 'chatgpt',
        userText: 'Hello AI',
        assistantText: 'Hello Human',
        modelName: 'GPT-4o',
      }

      // Test CustomEvent path
      window.dispatchEvent(new CustomEvent('trace:tokens', { detail: payload }))
      expect(callback).toHaveBeenCalledWith(payload)

      callback.mockClear()

      // Test postMessage path
      window.dispatchEvent({
        type: 'message',
        source: window,
        data: {
          source: TRACE_MARKER,
          type: 'trace:tokens',
          detail: payload,
        }
      } as any)

      expect(callback).toHaveBeenCalledWith(payload)
      cleanup()
    })
  })
})

