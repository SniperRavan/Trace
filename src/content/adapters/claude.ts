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
    this.fetchServerUsage()

    // Poll server-side official rate limits every 45s
    const usageInterval = setInterval(() => this.fetchServerUsage(), 45_000)
    this.cleanupFns.push(() => clearInterval(usageInterval))

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
        if (detail.userText) input = countTokens(detail.userText, 'claude')
        if (detail.assistantText) output = countTokens(detail.assistantText, 'claude')
      }

      const total = detail.totalTokens || input + output
      if (total <= 0) return

      useTraceStore.getState().addTokens('claude', total, input, output)
      console.log('[Trace] ClaudeAdapter +', total, 'tokens (in:', input, 'out:', output, ')')
    })

    this.cleanupFns.push(cleanupListener)
    console.log('[Trace] ClaudeAdapter started with persistent server-side usage syncing')
  }

  private async fetchServerUsage() {
    try {
      const orgsRes = await fetch('/api/organizations', {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
      })
      if (!orgsRes.ok) return
      const orgs = await orgsRes.json()
      const orgList = Array.isArray(orgs) ? orgs : [orgs]
      if (orgList.length === 0) return

      let planType: 'free' | 'pro' | 'team' | 'enterprise' = 'free'
      for (const org of orgList) {
        if (org?.capabilities?.includes('claude_pro') || org?.rate_limit_tier?.includes('pro') || org?.has_pro_subscription) {
          planType = 'pro'
          break
        } else if (org?.rate_limit_tier?.includes('team')) {
          planType = 'team'
          break
        }
      }
      useTraceStore.getState().setProviderTier('claude', planType)

      const primaryOrgId = orgList[0]?.uuid || orgList[0]?.id
      if (!primaryOrgId) return

      const usageRes = await fetch(`/api/organizations/${primaryOrgId}/usage`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
      })
      if (!usageRes.ok) return
      const usage = await usageRes.json()

      if (usage?.five_hour?.utilization != null || usage?.seven_day?.utilization != null || usage?.message_limit) {
        const sessionPct = usage.five_hour?.utilization != null
          ? Math.round(usage.five_hour.utilization * 100)
          : (usage.message_limit?.remaining != null ? Math.round((1 - usage.message_limit.remaining / 45) * 100) : undefined)

        const weeklyPct = usage.seven_day?.utilization != null
          ? Math.round(usage.seven_day.utilization * 100)
          : undefined

        const resetAtMs = usage.five_hour?.resets_at
          ? new Date(usage.five_hour.resets_at).getTime()
          : (usage.message_limit?.reset_at ? new Date(usage.message_limit.reset_at).getTime() : undefined)

        if (sessionPct != null || weeklyPct != null) {
          useTraceStore.getState().setExactUsage('claude', sessionPct, weeklyPct, resetAtMs)
          console.log('[Trace] ClaudeAdapter fetched server-side exact usage:', { sessionPct, weeklyPct, resetAtMs })
        }
      }
    } catch (err) {
      console.warn('[Trace] ClaudeAdapter fetchServerUsage failed:', err)
    }
  }

  private startPlanDetector() {
    let checks = 0
    const interval = setInterval(() => {
      checks++
      try {
        const lowerText = (document.body?.innerText || '').toLowerCase()
        const upgradeBtn = document.querySelector('a[href*="upgrade"], button[aria-label*="Upgrade"], [class*="upgrade"]')
        
        // Model auto-detection from DOM button & text
        const modelBtn = document.querySelector('button[aria-haspopup="menu"], [data-testid*="model-selector"]')
        const btnText = (modelBtn?.textContent || '').trim()

        let detectedModel = ''
        if (btnText.toLowerCase().includes('sonnet 5') || lowerText.includes('sonnet 5')) {
          const effortMatch = btnText.match(/Sonnet 5\s*(Low|Medium|High|Extra|Max)?/i)
          if (effortMatch && effortMatch[1]) {
            detectedModel = `Sonnet 5 ${effortMatch[1]}`
          } else {
            detectedModel = 'Sonnet 5'
          }
        } else if (lowerText.includes('3.7 sonnet') || lowerText.includes('claude 3.7')) {
          detectedModel = 'Claude 3.7 Sonnet'
        } else if (lowerText.includes('3.5 sonnet')) {
          detectedModel = 'Claude 3.5 Sonnet'
        } else if (lowerText.includes('haiku')) {
          detectedModel = 'Claude 3.5 Haiku'
        } else if (lowerText.includes('opus')) {
          detectedModel = 'Claude 3 Opus'
        }

        if (detectedModel) {
          useTraceStore.getState().setActiveModel('claude', detectedModel, 200000)
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
