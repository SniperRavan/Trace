import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class PerplexityAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    (useTraceStore.getState() as any).updateUsage('perplexity', { isActive: true })

    const cleanupListener = listenForTraceEvents('perplexity' as any, (detail) => {
      if (detail.modelName) {
        (useTraceStore.getState() as any).setActiveModel('perplexity', detail.modelName, detail.contextLimit)
      }

      let inputTokens = detail.inputTokens ?? 0
      let outputTokens = detail.outputTokens ?? 0

      if (!inputTokens && !outputTokens) {
        if (detail.userText) inputTokens = countTokens(detail.userText)
        if (detail.assistantText) outputTokens = countTokens(detail.assistantText)
      }

      const totalTokens = detail.totalTokens || inputTokens + outputTokens
      if (totalTokens <= 0) return

      (useTraceStore.getState() as any).addTokens('perplexity', totalTokens, inputTokens, outputTokens)
      console.log('[Trace] PerplexityAdapter +', totalTokens, 'tokens (in:', inputTokens, 'out:', outputTokens, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] PerplexityAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    ;(useTraceStore.getState() as any).updateUsage('perplexity', { isActive: false })
  }
}
