/**
 * src/content/adapters/chatgpt.ts
 *
 * ChatGPT provider adapter.
 * Uses exact token metrics when reported, BPE tokenizer for OpenAI models,
 * and tracks multi-token fields (input, output, reasoning).
 */

import { useTraceStore } from '@/storage/store'
import { buildUsageRecord } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class ChatGPTAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('chatgpt', { isActive: true })
    this.startPlanDetector()

    const cleanupListener = listenForTraceEvents('chatgpt', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('chatgpt', detail.planType)
      }

      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('chatgpt', detail.modelName, detail.contextLimit)
      }

      const record = buildUsageRecord({
        provider: 'chatgpt',
        model: detail.modelName,
        plan: detail.planType,
        inputTokens: detail.inputTokens,
        outputTokens: detail.outputTokens,
        reasoningTokens: detail.reasoningTokens,
        cachedInputTokens: detail.cachedInputTokens,
        userText: detail.userText,
        assistantText: detail.assistantText,
        source: detail.source,
        confidence: detail.confidence,
      })

      if (record.totalTokens && record.totalTokens > 0) {
        useTraceStore.getState().recordUsage(record, detail.eventId)
      }
    })

    this.cleanupFns.push(cleanupListener)
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
          clearInterval(interval)
        } else if (lowerText.includes('chatgpt team') || profileText.includes('team')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'team')
          clearInterval(interval)
        } else if (lowerText.includes('chatgpt enterprise')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'enterprise')
          clearInterval(interval)
        } else if (lowerText.includes('upgrade to plus') || lowerText.includes('upgrade plan') || lowerText.includes('free plan') || profileText.includes('free')) {
          useTraceStore.getState().setProviderTier('chatgpt', 'free')
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
