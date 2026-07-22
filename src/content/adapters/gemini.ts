import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class GeminiAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('gemini', { isActive: true })

    const cleanupListener = listenForTraceEvents('gemini', (detail) => {
      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('gemini', detail.modelName, detail.contextLimit)
      }

      let inputTokens = detail.inputTokens ?? 0
      let outputTokens = detail.outputTokens ?? 0

      if (!inputTokens && !outputTokens) {
        if (detail.userText) inputTokens = countTokens(detail.userText)
        if (detail.assistantText) outputTokens = countTokens(detail.assistantText)
      }

      const totalTokens = detail.totalTokens || inputTokens + outputTokens
      if (totalTokens <= 0) return

      useTraceStore.getState().addTokens('gemini', totalTokens, inputTokens, outputTokens)
      console.log('[Trace] GeminiAdapter +', totalTokens, 'tokens (in:', inputTokens, 'out:', outputTokens, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] GeminiAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('gemini', { isActive: false })
  }
}
