/**
 * src/content/providerDetect.ts
 *
 * Maps hostname → ProviderId.
 * Kept as a pure function — no side effects, easily testable.
 */

import type { ProviderId } from '@/storage/store'

const HOSTNAME_MAP: Record<string, ProviderId> = {
  'chatgpt.com': 'chatgpt',
  'chat.openai.com': 'chatgpt',
  'claude.ai': 'claude',
  'gemini.google.com': 'gemini',
}

export function detectProvider(hostname: string): ProviderId | null {
  return HOSTNAME_MAP[hostname] ?? null
}
