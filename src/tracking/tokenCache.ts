/**
 * src/tracking/tokenCache.ts
 *
 * Per-message conversation token caching to eliminate redundant tokenization
 * during live SSE streaming for Claude, ChatGPT, and Gemini.
 */

import { countTokens } from './estimator'
import type { ProviderId } from '@/storage/store'

interface CacheEntry {
  fingerprint: string
  tokens: number
  updatedAt: number
}

function computeFingerprint(text: string): string {
  if (!text) return ''
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i)
    hash |= 0
  }
  return `${text.length}:${hash}`
}

export class TokenCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number

  constructor(maxSize = 250) {
    this.maxSize = maxSize
  }

  /**
   * Retrieves or computes token count for a message chunk/id.
   */
  getTokenCount(key: string, text: string, provider: ProviderId | string = 'chatgpt'): number {
    if (!text) return 0

    const fp = computeFingerprint(text)
    const cached = this.cache.get(key)

    if (cached && cached.fingerprint === fp) {
      return cached.tokens
    }

    const tokens = countTokens(text, provider)
    
    // Evict oldest if max size reached
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      fingerprint: fp,
      tokens,
      updatedAt: Date.now(),
    })

    return tokens
  }

  /**
   * Clears cached token metrics for a conversation/message.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Returns current cache entry count.
   */
  get size(): number {
    return this.cache.size
  }
}

export const globalTokenCache = new TokenCache()
