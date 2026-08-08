/**
 * src/content/adapters/gemini.ts
 *
 * Gemini provider adapter.
 * Uses exact usageMetadata extracted from Google RPC payloads when available,
 * and SentencePiece-calibrated heuristics with reasoning/thinking support otherwise.
 */

import { useTraceStore } from '@/storage/store'
import { buildUsageRecord } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class GeminiAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('gemini', { isActive: true })
    this.startPlanDetector()

    const cleanupListener = listenForTraceEvents('gemini', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('gemini', detail.planType)
      }

      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('gemini', detail.modelName, detail.contextLimit)
      }

      const record = buildUsageRecord({
        provider: 'gemini',
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
        const advIcon = document.querySelector('mat-icon[fonticon="gemini_spark_sparkles_advanced"]') || document.querySelector('[aria-label*="Advanced"]')

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
          clearInterval(interval)
        } else if (lowerText.includes('try gemini advanced') || lowerText.includes('upgrade to gemini advanced') || lowerText.includes('try advanced')) {
          useTraceStore.getState().setProviderTier('gemini', 'free')
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
