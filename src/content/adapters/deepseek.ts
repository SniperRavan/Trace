/**
 * src/content/adapters/deepseek.ts
 */

import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class DeepSeekAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    (useTraceStore.getState() as any).updateUsage('deepseek', { isActive: true })

    const cleanupListener = listenForTraceEvents('deepseek' as any, (detail) => {
      if (detail.modelName) {
        (useTraceStore.getState() as any).setActiveModel('deepseek', detail.modelName, detail.contextLimit)
      }

      let input = detail.inputTokens ?? 0
      let output = detail.outputTokens ?? 0

      if (!input && !output) {
        if (detail.userText) input = countTokens(detail.userText)
        if (detail.assistantText) output = countTokens(detail.assistantText)
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      (useTraceStore.getState() as any).addTokens('deepseek', total, input, output)
      console.log('[Trace] DeepSeekAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] DeepSeekAdapter started')
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    ;(useTraceStore.getState() as any).updateUsage('deepseek', { isActive: false })
  }
}
