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
  'x.com': 'grok',
  'grok.com': 'grok',
  'www.grok.com': 'grok',
  'perplexity.ai': 'perplexity',
  'www.perplexity.ai': 'perplexity',
  'deepseek.com': 'deepseek',
  'chat.deepseek.com': 'deepseek',
  'meta.ai': 'meta',
  'www.meta.ai': 'meta',
}

export function detectProvider(hostname: string): ProviderId | null {
  return HOSTNAME_MAP[hostname] ?? null
}
