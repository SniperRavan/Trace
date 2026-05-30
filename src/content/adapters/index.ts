/**
 * src/content/adapters/index.ts
 *
 * Provider adapter factory.
 *
 * Each adapter is responsible for:
 *  - Observing the provider's DOM for message activity
 *  - Estimating token usage from visible content
 *  - Writing usage data to the Zustand store
 *
 * Adapters are lazy-loaded — only the adapter for the current
 * page loads, keeping memory footprint minimal.
 */

import type { ProviderId } from '@/providers/logos'

export interface ProviderAdapter {
  /** Start observing the page. Called once after overlay mounts. */
  start(): void
  /** Stop all observers. Called on page unload. */
  stop(): void
}

/** Stub adapter — used until real adapters are implemented in Phase 2. */
class StubAdapter implements ProviderAdapter {
  constructor(private provider: ProviderId) {}

  start() {
    console.debug(`[Trace] Stub adapter started for: ${this.provider}`)
  }

  stop() {}
}

export function createProviderAdapter(provider: ProviderId): ProviderAdapter {
  // Phase 1: return stub for all providers.
  // Phase 2: lazy-import real adapters per provider.
  return new StubAdapter(provider)
}
