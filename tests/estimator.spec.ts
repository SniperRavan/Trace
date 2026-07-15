import { describe, it, expect } from 'vitest'
import { countTokens, estimateTokens, formatTokens, formatResetTime } from '../src/tracking/estimator'

describe('Estimator Heuristics', () => {
  it('should count tokens correctly using lightweight 3.8 char heuristic', () => {
    expect(countTokens('')).toBe(0)
    // "Hello, world!" is 13 chars -> Math.ceil(13 / 3.8) = 4 tokens
    expect(countTokens('Hello, world!')).toBe(4)
  })

  it('should estimate total tokens as prompt + response (2.5x)', () => {
    const text = 'Hello, world!'
    const tokens = countTokens(text) // 4
    const expected = tokens + Math.ceil(tokens * 2.5) // 4 + 10 = 14
    expect(estimateTokens(text)).toBe(expected)
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
    
    const oneHourFromNow = now + 60 * 60 * 1000
    expect(formatResetTime(oneHourFromNow)).toBe('1h')

    const minutesFromNow = now + 45 * 60 * 1000
    expect(formatResetTime(minutesFromNow)).toBe('45m')
  })
})
