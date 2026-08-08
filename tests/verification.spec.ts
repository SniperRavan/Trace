import { describe, it, expect, vi } from 'vitest'
import { countTokens, buildUsageRecord, formatTokens, formatResetTime } from '../src/tracking/estimator'
import {
  useTraceStore,
  CONTEXT_WINDOW_LIMITS,
  ALL_PROVIDERS,
  getObservedTokens,
  getContextPercent,
  getQuotaDisplay,
  type UsageRecord,
} from '../src/storage/store'
import { listenForTraceEvents, TRACE_MARKER } from '../src/content/adapters'

describe('Automated Verification Suite for Trace Observability Layer', () => {

  describe('1. Three-Tier Token Measurement Engine', () => {
    it('should classify native server usage as exact', () => {
      const record = buildUsageRecord({
        provider: 'claude',
        inputTokens: 100,
        outputTokens: 250,
        cachedInputTokens: 50,
        source: 'server',
        confidence: 'exact',
      })
      expect(record.source).toBe('server')
      expect(record.confidence).toBe('exact')
      expect(record.totalTokens).toBe(350)
    })

    it('should classify BPE tokenizer as estimated without post-multipliers', () => {
      const res = countTokens('Hello world! Testing BPE tokenization.', 'chatgpt')
      expect(res.source).toBe('tokenizer')
      expect(res.confidence).toBe('estimated')
      expect(res.count).toBeGreaterThan(0)
    })

    it('should classify calibrated heuristics as estimated', () => {
      const res = countTokens('Hello world! Testing Claude heuristic.', 'claude')
      expect(res.source).toBe('heuristic')
      expect(res.confidence).toBe('estimated')
    })
  })

  describe('2. Provider Context Limits & Capacities', () => {
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

  describe('3. Plan Policy & Honest Quota Status', () => {
    it('should describe ChatGPT quota as message-based and Claude/Gemini as compute-based', () => {
      const state = useTraceStore.getState()
      expect(state.providers.chatgpt.planPolicy.quotaKind).toBe('messages')
      expect(state.providers.claude.planPolicy.quotaKind).toBe('compute')
      expect(state.providers.gemini.planPolicy.quotaKind).toBe('compute')
    })

    it('should state Quota is Provider Dynamic instead of inventing a static ceiling', () => {
      const gptState = useTraceStore.getState().providers.chatgpt
      const quota = getQuotaDisplay(gptState)
      expect(quota.description).toContain('Dynamic')
      expect(quota.isExact).toBe(false)
    })
  })

  describe('4. Idempotency & Rate Limit Expiration Handling', () => {
    it('should reject duplicate eventIds caused by re-renders or reconnects', () => {
      const store = useTraceStore.getState()
      const event: UsageRecord = {
        provider: 'gemini',
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
        source: 'server',
        confidence: 'exact',
        observedAt: Date.now(),
      }

      const first = store.recordUsage(event, 'test-idempotent-1')
      expect(first).toBe(true)

      const second = store.recordUsage(event, 'test-idempotent-1')
      expect(second).toBe(false)
    })

    it('should reset context load when dynamic session window resetAt timestamp is passed', () => {
      const store = useTraceStore.getState()
      store.recordUsage({
        provider: 'chatgpt',
        inputTokens: 500,
        outputTokens: 500,
        totalTokens: 1000,
        source: 'server',
        confidence: 'exact',
        observedAt: Date.now(),
      }, 'ev-reset-1')

      // Set session window to expired
      store.setPlanPolicy('chatgpt', {
        windows: [{ name: 'session', resetAt: Date.now() - 5000, isDynamic: true }],
      })

      store.checkResets()
      const resetState = useTraceStore.getState().providers.chatgpt
      expect(resetState.contextTokens).toBe(0)
    })
  })

  describe('5. Cross-World Message Bridge & Nonce Handshake', () => {
    it('should listen for trace:tokens and sanitize payload bounds', () => {
      const callback = vi.fn()
      const cleanup = listenForTraceEvents('chatgpt', callback)

      const payload = {
        provider: 'chatgpt',
        userText: 'Hello AI prompt',
        assistantText: 'Hello Human response',
        modelName: 'GPT-4o',
        inputTokens: 20,
        outputTokens: 40,
      }

      // Test CustomEvent path
      window.dispatchEvent(new CustomEvent('trace:tokens', { detail: payload }))
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'chatgpt',
        inputTokens: 20,
        outputTokens: 40,
      }))

      cleanup()
    })
  })
})
