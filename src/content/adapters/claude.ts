/**
 * src/content/adapters/claude.ts
 */

import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import type { ProviderAdapter } from './index'

export class ClaudeAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('claude', { isActive: true })

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.provider !== 'claude') return

      let input = detail.inputTokens ?? 0
      let output = detail.outputTokens ?? 0

      if (!input && !output) {
        if (detail.userText) input = countTokens(detail.userText)
        if (detail.assistantText) output = countTokens(detail.assistantText)
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      useTraceStore.getState().addTokens('claude', total, input, output)
      console.log('[Trace] ClaudeAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    }

    window.addEventListener('trace:tokens', handler)
    this.cleanupFns.push(() => window.removeEventListener('trace:tokens', handler))
    console.log('[Trace] ClaudeAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
  }
}
