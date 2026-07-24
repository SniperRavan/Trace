import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class GrokAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    (useTraceStore.getState() as any).updateUsage('grok', { isActive: true })

    const cleanupListener = listenForTraceEvents('grok' as any, (detail) => {
      if (detail.modelName) {
        (useTraceStore.getState() as any).setActiveModel('grok', detail.modelName, detail.contextLimit)
      }

      let inputTokens = detail.inputTokens ?? 0
      let outputTokens = detail.outputTokens ?? 0

      if (!inputTokens && !outputTokens) {
        if (detail.userText) inputTokens = countTokens(detail.userText)
        if (detail.assistantText) outputTokens = countTokens(detail.assistantText)
      }

      const totalTokens = detail.totalTokens || inputTokens + outputTokens
      if (totalTokens <= 0) return

      (useTraceStore.getState() as any).addTokens('grok', totalTokens, inputTokens, outputTokens)
      console.log('[Trace] GrokAdapter +', totalTokens, 'tokens (in:', inputTokens, 'out:', outputTokens, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] GrokAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    ;(useTraceStore.getState() as any).updateUsage('grok', { isActive: false })
  }
}
