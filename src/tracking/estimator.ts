/**
 * src/tracking/estimator.ts
 *
 * Per-provider tokenization engine with unicode/CJK and code density awareness.
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
    // Fall back to heuristics if BPE fails
  }

  // Count non-English CJK characters (Chinese, Japanese, Korean) which take ~1.5 tokens per char
  const cjkMatches = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const cjkTokens = Math.ceil(cjkMatches * 1.5)

  // Remove CJK chars for standard character ratio counting
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '')

  // Code density adjustments (brackets, operators, indentation, keywords)
  const codeSymbolMatches = (nonCjkText.match(/[\{\}\[\]\(\)<>=;:+\-*\/\\\^|&]/g) || []).length
  const codeBonus = Math.ceil(codeSymbolMatches * 0.25)

  // Provider-specific tokenizer heuristics:
  let baseTokens = 0
  switch (normalizedProvider) {
    case 'claude': {
      // Anthropic tokenization: ~3.5 chars/token
      baseTokens = Math.ceil(nonCjkText.length / 3.5)
      break
    }
    case 'gemini': {
      // Google SentencePiece tokenization: ~4.0 chars/token
      baseTokens = Math.ceil(nonCjkText.length / 4.0)
      break
    }
    case 'deepseek': {
      // DeepSeek Byte-level BPE: ~3.6 chars/token
      baseTokens = Math.ceil(nonCjkText.length / 3.6)
      break
    }
    default: {
      // General fallback heuristic (~3.8 chars/token)
      baseTokens = Math.ceil(nonCjkText.length / 3.8)
      break
    }
  }

  return Math.max(1, baseTokens + cjkTokens + codeBonus)
}

export function estimateTokens(
  promptText: string,
  replyOrProvider?: string,
  provider: ProviderId | string = 'chatgpt'
): number {
  let replyText = ''
  let p = provider

  if (typeof replyOrProvider === 'string' && (replyOrProvider === 'chatgpt' || replyOrProvider === 'claude' || replyOrProvider === 'gemini' || replyOrProvider === 'deepseek')) {
    p = replyOrProvider as ProviderId
  } else if (typeof replyOrProvider === 'string') {
    replyText = replyOrProvider
  }

  const promptTokens = countTokens(promptText, p)
  if (replyText) {
    const replyTokens = countTokens(replyText, p)
    return promptTokens + replyTokens
  }

  // Dynamic reply multiplier heuristic based on prompt length
  const replyMultiplier = promptTokens > 500 ? 1.8 : 2.5
  const estimatedReply = Math.ceil(promptTokens * replyMultiplier)
  return promptTokens + estimatedReply
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
