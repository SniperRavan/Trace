/**
 * src/content/adapters/index.ts
 * Provider adapter factory & isolated-world secure event listener.
 *
 * Security:
 * - Validates message payloads from MAIN world
 * - Rejects malformed types, oversized strings, and invalid numbers
 * - Sanitizes and passes structured UsageRecord to store
 */

import type { ProviderId, UsageRecord } from '@/storage/store'

export const TRACE_MARKER = '__TRACE_EXTENSION__'
const VALID_PROVIDERS: ProviderId[] = ['chatgpt', 'claude', 'gemini']

export interface ProviderAdapter {
  start(): void
  stop(): void
}

export interface ValidatedTraceDetail {
  provider: ProviderId
  eventId?: string
  source?: 'server' | 'tokenizer' | 'heuristic'
  confidence?: 'exact' | 'estimated' | 'unknown'
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
  totalTokens?: number
  userText?: string
  assistantText?: string
  modelName?: string
  contextLimit?: number
  planType?: 'free' | 'pro' | 'team' | 'enterprise'
  isExactUsage?: boolean
  sessionPct?: number
  weeklyPct?: number
  resetAtMs?: number
  isStreaming?: boolean
}

/**
 * Validates untrusted payload from MAIN world.
 */
function sanitizePayload(raw: any, targetProvider: ProviderId): ValidatedTraceDetail | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.provider !== targetProvider && !VALID_PROVIDERS.includes(raw.provider)) {
    return null
  }

  const cleanNum = (val: any): number | undefined => {
    if (typeof val !== 'number' || isNaN(val) || val < 0 || !isFinite(val)) return undefined
    return Math.min(val, 10_000_000) // Upper limit guard against malicious overflows
  }

  const cleanStr = (val: any, maxLen = 200): string | undefined => {
    if (typeof val !== 'string') return undefined
    return val.slice(0, maxLen).trim()
  }

  const detail: ValidatedTraceDetail = {
    provider: targetProvider,
    eventId: cleanStr(raw.eventId, 128),
    source: ['server', 'tokenizer', 'heuristic'].includes(raw.source) ? raw.source : undefined,
    confidence: ['exact', 'estimated', 'unknown'].includes(raw.confidence) ? raw.confidence : undefined,
    inputTokens: cleanNum(raw.inputTokens),
    outputTokens: cleanNum(raw.outputTokens),
    reasoningTokens: cleanNum(raw.reasoningTokens),
    cachedInputTokens: cleanNum(raw.cachedInputTokens),
    cacheCreationTokens: cleanNum(raw.cacheCreationTokens),
    totalTokens: cleanNum(raw.totalTokens),
    modelName: cleanStr(raw.modelName, 64),
    contextLimit: cleanNum(raw.contextLimit),
    planType: ['free', 'pro', 'team', 'enterprise'].includes(raw.planType) ? raw.planType : undefined,
    isExactUsage: Boolean(raw.isExactUsage),
    sessionPct: cleanNum(raw.sessionPct),
    weeklyPct: cleanNum(raw.weeklyPct),
    resetAtMs: cleanNum(raw.resetAtMs),
    isStreaming: Boolean(raw.isStreaming),
  }

  // Text inputs: sanitize and cap length to prevent memory abuse
  if (typeof raw.userText === 'string') {
    detail.userText = raw.userText.slice(0, 100_000)
  }
  if (typeof raw.assistantText === 'string') {
    detail.assistantText = raw.assistantText.slice(0, 100_000)
  }

  return detail
}

export function listenForTraceEvents(
  provider: ProviderId,
  onDetail: (detail: ValidatedTraceDetail) => void
): () => void {
  const customHandler = (e: Event) => {
    const raw = (e as CustomEvent).detail
    const sanitized = sanitizePayload(raw, provider)
    if (sanitized) onDetail(sanitized)
  }

  const messageHandler = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== TRACE_MARKER) return
    if (e.data?.type !== 'trace:tokens') return
    const raw = e.data.detail
    const sanitized = sanitizePayload(raw, provider)
    if (sanitized) onDetail(sanitized)
  }

  window.addEventListener('trace:tokens', customHandler)
  window.addEventListener('message', messageHandler)

  return () => {
    window.removeEventListener('trace:tokens', customHandler)
    window.removeEventListener('message', messageHandler)
  }
}

class StubAdapter implements ProviderAdapter {
  constructor(private provider: ProviderId) { }
  start() { console.debug(`[Trace] Stub adapter: ${this.provider}`) }
  stop() { }
}

export async function createProviderAdapter(provider: ProviderId): Promise<ProviderAdapter> {
  if (provider === 'claude') { const { ClaudeAdapter } = await import('./claude'); return new ClaudeAdapter() }
  if (provider === 'chatgpt') { const { ChatGPTAdapter } = await import('./chatgpt'); return new ChatGPTAdapter() }
  if (provider === 'gemini') { const { GeminiAdapter } = await import('./gemini'); return new GeminiAdapter() }
  return new StubAdapter(provider)
}
