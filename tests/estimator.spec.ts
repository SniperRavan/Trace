import { describe, it, expect } from 'vitest'
import {
  countTokens,
  countTokensNumeric,
  buildUsageRecord,
  estimateTokens,
  formatTokens,
  formatResetTime,
} from '../src/tracking/estimator'

describe('Estimator & Multi-Token Engine', () => {
  it('should count tokens with source and confidence indicators', () => {
    const emptyRes = countTokens('', 'chatgpt')
    expect(emptyRes.count).toBe(0)

    // ChatGPT uses BPE tokenizer
    const gptRes = countTokens('Hello, world!', 'chatgpt')
    expect(gptRes.count).toBe(4)
    expect(gptRes.source).toBe('tokenizer')
    expect(gptRes.confidence).toBe('estimated')

    // Claude uses calibrated heuristic (~3.5 chars/tok)
    const claudeRes = countTokens('Hello, world!', 'claude')
    expect(claudeRes.count).toBeGreaterThanOrEqual(3)
    expect(claudeRes.source).toBe('heuristic')

    // Gemini uses calibrated SentencePiece heuristic (~4.0 chars/tok)
    const geminiRes = countTokens('Hello, world!', 'gemini')
    expect(geminiRes.count).toBeGreaterThanOrEqual(3)
    expect(geminiRes.source).toBe('heuristic')
  })

  it('should construct complete UsageRecord with multi-token breakdown', () => {
    const record = buildUsageRecord({
      provider: 'chatgpt',
      model: 'o3-mini',
      inputTokens: 150,
      outputTokens: 400,
      reasoningTokens: 250,
      cachedInputTokens: 50,
      source: 'server',
      confidence: 'exact',
    })

    expect(record.provider).toBe('chatgpt')
    expect(record.model).toBe('o3-mini')
    expect(record.inputTokens).toBe(150)
    expect(record.outputTokens).toBe(400)
    expect(record.reasoningTokens).toBe(250)
    expect(record.cachedInputTokens).toBe(50)
    expect(record.totalTokens).toBe(800) // 150 + 400 + 250
    expect(record.source).toBe('server')
    expect(record.confidence).toBe('exact')
  })

  it('should format token labels cleanly across scales', () => {
    expect(formatTokens(500)).toBe('500')
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(20000)).toBe('20k')
    expect(formatTokens(1500000)).toBe('1.5M')
  })

  it('should format reset timers dynamically', () => {
    const now = Date.now()
    expect(formatResetTime(now - 1000)).toBe('resetting')

    const oneHourFromNow = now + 60 * 60 * 1000 + 5000
    expect(formatResetTime(oneHourFromNow)).toBe('1h')

    const minutesFromNow = now + 45 * 60 * 1000 + 5000
    expect(formatResetTime(minutesFromNow)).toBe('45m')
  })
})
