/**
 * src/content/adapters/meta_ai.ts
 */

import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class MetaAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    (useTraceStore.getState() as any).updateUsage('meta', { isActive: true })

    const cleanupListener = listenForTraceEvents('meta' as any, (detail) => {
      if (detail.modelName) {
        (useTraceStore.getState() as any).setActiveModel('meta', detail.modelName, detail.contextLimit)
      }

      let input = detail.inputTokens ?? 0
      let output = detail.outputTokens ?? 0

      if (!input && !output) {
        if (detail.userText) input = countTokens(detail.userText)
        if (detail.assistantText) output = countTokens(detail.assistantText)
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      (useTraceStore.getState() as any).addTokens('meta', total, input, output)
      console.log('[Trace] MetaAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] MetaAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    ;(useTraceStore.getState() as any).updateUsage('meta', { isActive: false })
  }
}
