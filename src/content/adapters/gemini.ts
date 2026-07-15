import { useTraceStore } from '@/storage/store'
import type { ProviderAdapter } from './index'

export class GeminiAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('gemini', { isActive: true })
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.provider !== 'gemini') return
      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = detail
      useTraceStore.getState().addTokens('gemini', totalTokens || inputTokens + outputTokens, inputTokens, outputTokens)
      console.log('[Trace] GeminiAdapter intercepted — in:', inputTokens, 'out:', outputTokens)
    }
    window.addEventListener('trace:tokens', handler)
    this.cleanupFns.push(() => window.removeEventListener('trace:tokens', handler))
    console.log('[Trace] GeminiAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('gemini', { isActive: false })
  }
}
