import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class GeminiAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('gemini', { isActive: true })
    this.startPlanDetector()

    const cleanupListener = listenForTraceEvents('gemini', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('gemini', detail.planType)
        console.log('[Trace] GeminiAdapter auto-detected plan tier:', detail.planType)
      }

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
    console.log('[Trace] GeminiAdapter started with persistent local plan auto-detection')
  }

  private startPlanDetector() {
    let checks = 0
    const interval = setInterval(() => {
      checks++
      try {
        const lowerText = (document.body?.innerText || '').toLowerCase()
        const advIcon = document.querySelector('mat-icon[fonticon="gemini_spark_sparkles_advanced"]') || document.querySelector('[aria-label*="Advanced"]')
        
        // Model auto-detection from DOM dropdown / text
        if (lowerText.includes('3.5 flash-lite') || lowerText.includes('flash-lite')) {
          useTraceStore.getState().setActiveModel('gemini', '3.5 Flash-Lite', 1000000)
        } else if (lowerText.includes('3.1 pro') || lowerText.includes('gemini 3.1')) {
          useTraceStore.getState().setActiveModel('gemini', '3.1 Pro', 2000000)
        } else if (lowerText.includes('extended thinking') || lowerText.includes('thinking')) {
          useTraceStore.getState().setActiveModel('gemini', 'Extended thinking', 2000000)
        } else if (lowerText.includes('3.6 flash') || lowerText.includes('gemini flash')) {
          useTraceStore.getState().setActiveModel('gemini', '3.6 Flash', 1000000)
        }

        if (lowerText.includes('gemini advanced') || advIcon) {
          useTraceStore.getState().setProviderTier('gemini', 'pro')
          useTraceStore.getState().setTier('pro')
          clearInterval(interval)
        } else if (lowerText.includes('try gemini advanced') || lowerText.includes('upgrade to gemini advanced') || lowerText.includes('try advanced') || lowerText.includes('free plan')) {
          useTraceStore.getState().setProviderTier('gemini', 'free')
          useTraceStore.getState().setTier('free')
          clearInterval(interval)
        }
      } catch {}

      if (checks >= 20) clearInterval(interval)
    }, 800)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('gemini', { isActive: false })
  }
}
