/**
 * src/content/adapters/claude.ts
 */

import { useTraceStore } from '@/storage/store'
import { countTokens } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

export class ClaudeAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('claude', { isActive: true })
    this.startPlanDetector()

    const cleanupListener = listenForTraceEvents('claude', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('claude', detail.planType)
        console.log('[Trace] ClaudeAdapter auto-detected plan tier via API:', detail.planType)
      }

      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('claude', detail.modelName, detail.contextLimit)
      }

      if (detail.isExactUsage) {
        useTraceStore.getState().setExactUsage('claude', detail.sessionPct, detail.weeklyPct, detail.resetAtMs)
        console.log('[Trace] ClaudeAdapter updated exact usage:', detail)
        return
      }

      let input = detail.inputTokens ?? 0
      let output = detail.outputTokens ?? 0

      if (!input && !output) {
        if (detail.userText) input = countTokens(detail.userText)
        if (detail.assistantText) output = countTokens(detail.assistantText)
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      useTraceStore.getState().addTokens('claude', total, input, output)
      console.log('[Trace] ClaudeAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] ClaudeAdapter started with persistent local plan auto-detection')
  }

  private startPlanDetector() {
    let checks = 0
    const interval = setInterval(() => {
      checks++
      try {
        const lowerText = (document.body?.innerText || '').toLowerCase()
        const upgradeBtn = document.querySelector('a[href*="upgrade"], button[aria-label*="Upgrade"], [class*="upgrade"]')
        
        // Model auto-detection from DOM
        if (lowerText.includes('3.7 sonnet') || lowerText.includes('claude 3.7')) {
          useTraceStore.getState().setActiveModel('claude', 'Claude 3.7 Sonnet', 200000)
        } else if (lowerText.includes('3.5 sonnet') || lowerText.includes('sonnet 5') || lowerText.includes('sonnet')) {
          useTraceStore.getState().setActiveModel('claude', 'Claude 3.5 Sonnet', 200000)
        } else if (lowerText.includes('haiku')) {
          useTraceStore.getState().setActiveModel('claude', 'Claude 3.5 Haiku', 200000)
        } else if (lowerText.includes('opus')) {
          useTraceStore.getState().setActiveModel('claude', 'Claude 3 Opus', 200000)
        }

        if (lowerText.includes('claude pro') || lowerText.includes('pro plan')) {
          useTraceStore.getState().setProviderTier('claude', 'pro')
          clearInterval(interval)
        } else if (lowerText.includes('claude team') || lowerText.includes('team plan')) {
          useTraceStore.getState().setProviderTier('claude', 'team')
          clearInterval(interval)
        } else if (lowerText.includes('free plan') || lowerText.includes('upgrade') || upgradeBtn) {
          useTraceStore.getState().setProviderTier('claude', 'free')
          clearInterval(interval)
        }
      } catch {}

      if (checks >= 20) clearInterval(interval)
    }, 800)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
  }
}
