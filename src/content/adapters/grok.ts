import { useTraceStore } from '@/storage/store'
import type { ProviderAdapter } from './index'

export class GrokAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('grok', { isActive: true })
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.provider !== 'grok') return
      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = detail
      useTraceStore.getState().addTokens('grok', totalTokens || inputTokens + outputTokens, inputTokens, outputTokens)
      console.log('[Trace] GrokAdapter intercepted — in:', inputTokens, 'out:', outputTokens)
    }
    window.addEventListener('trace:tokens', handler)
    this.cleanupFns.push(() => window.removeEventListener('trace:tokens', handler))
    console.log('[Trace] GrokAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('grok', { isActive: false })
  }
}
