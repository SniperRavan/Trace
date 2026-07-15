import { useTraceStore } from '@/storage/store'
import type { ProviderAdapter } from './index'

export class PerplexityAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('perplexity', { isActive: true })
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.provider !== 'perplexity') return
      
      let inputTokens = detail.inputTokens ?? 0
      let outputTokens = detail.outputTokens ?? 0

      if (!inputTokens && !outputTokens) {
        if (detail.userText) {
          inputTokens = Math.ceil(detail.userText.length / 3.8)
        }
        if (detail.assistantText) {
          outputTokens = Math.ceil(detail.assistantText.length / 3.8)
        }
      }

      const totalTokens = detail.totalTokens || (inputTokens + outputTokens)
      if (totalTokens <= 0) return

      useTraceStore.getState().addTokens('perplexity', totalTokens, inputTokens, outputTokens)
      console.log('[Trace] PerplexityAdapter intercepted — in:', inputTokens, 'out:', outputTokens)
    }
    window.addEventListener('trace:tokens', handler)
    this.cleanupFns.push(() => window.removeEventListener('trace:tokens', handler))
    console.log('[Trace] PerplexityAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('perplexity', { isActive: false })
  }
}
