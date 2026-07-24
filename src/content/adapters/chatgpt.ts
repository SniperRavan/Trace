/**
 * src/content/adapters/chatgpt.ts
 */

import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class ChatGPTAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('chatgpt', { isActive: true })
    this.startPlanDetector()

    const cleanupListener = listenForTraceEvents('chatgpt', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('chatgpt', detail.planType)
        console.log('[Trace] ChatGPTAdapter auto-detected plan tier via API:', detail.planType)
      }

      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('chatgpt', detail.modelName, detail.contextLimit)
      }

      let input = detail.inputTokens ?? 0
      let output = detail.outputTokens ?? 0

      if (!input && !output) {
        if (detail.userText) input = countTokens(detail.userText)
        if (detail.assistantText) output = countTokens(detail.assistantText)
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      useTraceStore.getState().addTokens('chatgpt', total, input, output)
      console.log('[Trace] ChatGPTAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] ChatGPTAdapter started with persistent local plan auto-detection')
  }

  private startPlanDetector() {
    let checks = 0
    const interval = setInterval(() => {
      checks++
      try {
        const lowerText = (document.body?.innerText || '').toLowerCase()
        const profileText = (document.querySelector('[data-testid="user-profile-button"]')?.textContent || '').toLowerCase()
        
        if (lowerText.includes('chatgpt plus') || profileText.includes('plus') || lowerText.includes('plus subscriber')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'pro')
          useTraceStore.getState().setTier('pro')
          clearInterval(interval)
        } else if (lowerText.includes('chatgpt team') || profileText.includes('team')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'team')
          useTraceStore.getState().setTier('team')
          clearInterval(interval)
        } else if (lowerText.includes('chatgpt enterprise')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'enterprise')
          useTraceStore.getState().setTier('enterprise')
          clearInterval(interval)
        } else if (lowerText.includes('upgrade to plus') || lowerText.includes('upgrade plan') || lowerText.includes('free plan') || profileText.includes('free')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'free')
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
    useTraceStore.getState().updateUsage('chatgpt', { isActive: false })
  }
}
