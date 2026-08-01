/**
 * src/tracking/estimator.ts
 */

import { encode } from 'gpt-tokenizer'
import type { ProviderId } from '@/storage/store'

export function countTokens(text: string, provider: ProviderId | string = 'chatgpt'): number {
  if (!text) return 0
  const normalizedProvider = provider.toLowerCase()

  try {
    if (normalizedProvider === 'chatgpt' || normalizedProvider === 'openai') {
      return encode(text).length
    }
  } catch {
    // Fall back to ratio heuristics if BPE fails
  }

  // Provider-specific tokenizer heuristics:
  switch (normalizedProvider) {
    case 'claude': {
      // Anthropic tokenization: average ~3.5 characters per token, adjusted for whitespace & code block symbols
      const codeBonus = (text.match(/[\{\}\[\]\(\)<>=;:+\-*\/]/g) || []).length * 0.2
      return Math.ceil(text.length / 3.5 + codeBonus)
    }
    case 'gemini': {
      // Google SentencePiece tokenization: average ~4.0 characters per token
      return Math.ceil(text.length / 4.0)
    }
    case 'deepseek': {
      // DeepSeek Byte-level BPE: average ~3.6 characters per token
      return Math.ceil(text.length / 3.6)
    }
    default: {
      // General fallback heuristic (~3.8 chars/token)
      return Math.ceil(text.length / 3.8)
    }
  }
}

export function estimateTokens(text: string, provider: ProviderId | string = 'chatgpt'): number {
  const prompt = countTokens(text, provider)
  const response = Math.ceil(prompt * 2.5)
  return prompt + response
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export function formatResetTime(resetAt: number): string {
  const diff = resetAt - Date.now()
  if (diff <= 0) return 'resetting'
  const totalMins = Math.floor(diff / 60000)
  if (totalMins < 1) return '< 1m'
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
