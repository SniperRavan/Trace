import { describe, it, expect, beforeEach } from 'vitest'
import { TokenCache } from '../src/tracking/tokenCache'

describe('TokenCache', () => {
  let cache: TokenCache

  beforeEach(() => {
    cache = new TokenCache(5)
  })

  it('computes and caches token counts', () => {
    const text = 'Hello world, this is a test prompt for Claude and ChatGPT.'
    const count1 = cache.getTokenCount('msg-1', text, 'claude')
    expect(count1).toBeGreaterThan(0)
    expect(cache.size).toBe(1)

    // Second call with same text should return cached value instantly
    const count2 = cache.getTokenCount('msg-1', text, 'claude')
    expect(count2).toBe(count1)
  })

  it('invalidates cache when text changes for same key', () => {
    const text1 = 'First iteration'
    const text2 = 'First iteration with additional streamed content'

    const count1 = cache.getTokenCount('msg-1', text1, 'chatgpt')
    const count2 = cache.getTokenCount('msg-1', text2, 'chatgpt')

    expect(count2).toBeGreaterThan(count1)
  })

  it('evicts oldest entries when capacity limit is reached', () => {
    for (let i = 0; i < 6; i++) {
      cache.getTokenCount(`key-${i}`, `Content ${i}`, 'gemini')
    }

    expect(cache.size).toBe(5)
  })
})
