/**
 * src/tracking/estimator.ts
 *
 * Tiered tokenization engine:
 * 1. Native server usage (exact)
 * 2. Model-specific tokenizer (estimated)
 * 3. Calibrated provider heuristics (fallback)
 */

import { encode } from 'gpt-tokenizer'
import type { ProviderId, UsageRecord, TokenSource, TokenConfidence } from '@/storage/store'

/**
 * Counts tokens for text using the appropriate tokenizer or calibrated heuristic.
 * Note: Never apply CJK/code bonuses on top of an actual BPE tokenizer.
 */
export function countTokens(
  text: string,
  provider: ProviderId | string = 'chatgpt',
  modelName: string = ''
): { count: number; source: TokenSource; confidence: TokenConfidence } {
  if (!text) return { count: 0, source: 'heuristic', confidence: 'exact' }
  const normalizedProvider = provider.toLowerCase()

  // 1. Model-specific BPE Tokenizer for OpenAI / ChatGPT
  if (normalizedProvider === 'chatgpt' || normalizedProvider === 'openai') {
    try {
      const tokens = encode(text).length
      return { count: tokens, source: 'tokenizer', confidence: 'estimated' }
    } catch {
      // Fallback to calibrated heuristic if tokenizer fails
    }
  }

  // 2. Calibrated Heuristics for providers without bundled WASM/JS tokenizers
  // Heuristic adjustments for non-Latin / CJK scripts and code density
  const cjkMatches = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || []).length
  const cjkTokens = Math.ceil(cjkMatches * 1.5)
  const nonCjkText = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '')

  const codeSymbolMatches = (nonCjkText.match(/[\{\}\[\]\(\)<>=;:+\-*\/\\\^|&]/g) || []).length
  const codeBonus = Math.ceil(codeSymbolMatches * 0.2)

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

  const finalCount = Math.max(1, baseTokens + cjkTokens + codeBonus)
  return { count: finalCount, source: 'heuristic', confidence: 'estimated' }
}

/**
 * Convenience wrapper returning numeric token count for backwards compatibility.
 */
export function countTokensNumeric(
  text: string,
  provider: ProviderId | string = 'chatgpt',
  modelName: string = ''
): number {
  return countTokens(text, provider, modelName).count
}

/**
 * Builds a structured UsageRecord with complete multi-token breakdown.
 */
export function buildUsageRecord(params: {
  provider: ProviderId
  model?: string
  plan?: string
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
  userText?: string
  assistantText?: string
  source?: TokenSource
  confidence?: TokenConfidence
}): UsageRecord {
  let inTok = params.inputTokens ?? 0
  let outTok = params.outputTokens ?? 0
  let reasoningTok = params.reasoningTokens ?? 0
  let cachedTok = params.cachedInputTokens ?? 0
  let cacheCreateTok = params.cacheCreationTokens ?? 0

  let src = params.source ?? 'server'
  let conf = params.confidence ?? 'exact'

  if (!inTok && params.userText) {
    const res = countTokens(params.userText, params.provider, params.model)
    inTok = res.count
    src = res.source
    conf = res.confidence
  }

  if (!outTok && params.assistantText) {
    const res = countTokens(params.assistantText, params.provider, params.model)
    outTok = res.count
    if (src !== 'heuristic') src = res.source
    conf = res.confidence
  }

  // Billable total can differ from input + output when reasoning or cached tokens are involved
  const totalTokens = inTok + outTok + reasoningTok + cacheCreateTok

  return {
    provider: params.provider,
    model: params.model,
    plan: params.plan,
    inputTokens: inTok,
    outputTokens: outTok,
    reasoningTokens: reasoningTok,
    cachedInputTokens: cachedTok,
    cacheCreationTokens: cacheCreateTok,
    totalTokens,
    source: src,
    confidence: conf,
    observedAt: Date.now(),
  }
}

export function estimateTokens(
  promptText: string,
  replyOrProvider?: string,
  provider: ProviderId | string = 'chatgpt'
): number {
  let replyText = ''
  let p = provider

  if (
    typeof replyOrProvider === 'string' &&
    ['chatgpt', 'claude', 'gemini', 'deepseek', 'grok', 'perplexity'].includes(replyOrProvider)
  ) {
    p = replyOrProvider as ProviderId
  } else if (typeof replyOrProvider === 'string') {
    replyText = replyOrProvider
  }

  const promptTokens = countTokensNumeric(promptText, p)
  if (replyText) {
    const replyTokens = countTokensNumeric(replyText, p)
    return promptTokens + replyTokens
  }

  // Dynamic reply multiplier heuristic based on prompt length
  const replyMultiplier = promptTokens > 500 ? 1.8 : 2.5
  const estimatedReply = Math.ceil(promptTokens * replyMultiplier)
  return promptTokens + estimatedReply
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(n))
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
