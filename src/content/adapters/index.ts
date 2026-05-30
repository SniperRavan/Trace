/**
 * src/content/adapters/index.ts
 * Provider adapter factory — returns the right adapter per provider.
 */

import type { ProviderId } from '@/providers/logos'

export interface ProviderAdapter {
  start(): void
  stop():  void
}

class StubAdapter implements ProviderAdapter {
  constructor(private provider: ProviderId) {}
  start() {
    console.debug(`[Trace] Stub adapter for: ${this.provider}`)
  }
  stop() {}
}

export async function createProviderAdapter(provider: ProviderId): Promise<ProviderAdapter> {
  if (provider === 'claude') {
    const { ClaudeAdapter } = await import('./claude')
    return new ClaudeAdapter()
  }
  if (provider === 'chatgpt') {
    const { ChatGPTAdapter } = await import('./chatgpt')
    return new ChatGPTAdapter()
  }
  return new StubAdapter(provider)
}
