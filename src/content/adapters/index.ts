/**
 * src/content/adapters/index.ts
 * Provider adapter factory — returns the right adapter per provider.
 */

import type { ProviderId } from '@/storage/store'

export interface ProviderAdapter {
  start(): void
  stop(): void
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
  if (provider === 'grok') { const { GrokAdapter } = await import('./grok'); return new GrokAdapter() }
  if (provider === 'perplexity') { const { PerplexityAdapter } = await import('./perplexity'); return new PerplexityAdapter() }
  return new StubAdapter(provider)
}
