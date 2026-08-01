import { describe, it, expect } from 'vitest'
import { countTokens, estimateTokens, formatTokens, formatResetTime } from '../src/tracking/estimator'

describe('Estimator Heuristics', () => {
  it('should count tokens correctly for different provider tokenizers', () => {
    expect(countTokens('', 'chatgpt')).toBe(0)
    // ChatGPT (BPE): "Hello, world!" -> 4 tokens
    expect(countTokens('Hello, world!', 'chatgpt')).toBe(4)
    // Claude: ~3.5 chars/token
    expect(countTokens('Hello, world!', 'claude')).toBe(4)
    // Gemini: ~4.0 chars/token
    expect(countTokens('Hello, world!', 'gemini')).toBe(4)
    // DeepSeek: ~3.6 chars/token
    expect(countTokens('Hello, world!', 'deepseek')).toBe(4)
  })

  it('should estimate total tokens as prompt + response (2.5x)', () => {
    const text = 'Hello, world!'
    const tokens = countTokens(text, 'chatgpt') // 4
    const expected = tokens + Math.ceil(tokens * 2.5) // 4 + 10 = 14
    expect(estimateTokens(text, 'chatgpt')).toBe(expected)
  })

  it('should format token labels cleanly', () => {
    expect(formatTokens(500)).toBe('500')
    expect(formatTokens(1000)).toBe('1k')
    expect(formatTokens(1500)).toBe('1.5k')
    expect(formatTokens(20000)).toBe('20k')
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
