/**
 * src/content/adapters/claude.ts
 *
 * Claude provider adapter.
 * Uses exact server-reported token numbers (message_start / message_delta usage),
 * handles prompt caching tokens (cache_read, cache_creation), and polls /usage.
 */

import { useTraceStore } from '@/storage/store'
import { buildUsageRecord } from '@/tracking/estimator'
import { type ProviderAdapter, listenForTraceEvents } from './index'

function parseClaudeUsagePayload(payload: any) {
  let sessionPct: number | undefined
  let weeklyPct: number | undefined
  let resetAtMs: number | undefined

  if (Array.isArray(payload?.limits)) {
    for (const entry of payload.limits) {
      const p = entry.percent ?? entry.percentage ?? entry.utilization
      const r = entry.resets_at ?? entry.reset_at
      if (entry.kind === 'session' && p != null) {
        sessionPct = Math.round(Number(p) <= 1.0 ? Number(p) * 100 : Number(p))
        if (r) resetAtMs = new Date(r).getTime()
      } else if ((entry.kind === 'weekly_all' || entry.kind === 'weekly_scoped') && p != null) {
        weeklyPct = Math.round(Number(p) <= 1.0 ? Number(p) * 100 : Number(p))
      }
    }
  }

  return { sessionPct, weeklyPct, resetAtMs }
}

export class ClaudeAdapter implements ProviderAdapter {
  private cleanupFns: (() => void)[] = []

  start() {
    useTraceStore.getState().updateUsage('claude', { isActive: true })
    this.startPlanDetector()
    this.fetchServerUsage()

    // Periodic check for server-side rate limits
    const usageInterval = setInterval(() => this.fetchServerUsage(), 45_000)
    this.cleanupFns.push(() => clearInterval(usageInterval))

    const cleanupListener = listenForTraceEvents('claude', (detail) => {
      if (detail.planType) {
        useTraceStore.getState().setProviderTier('claude', detail.planType)
      }

      if (detail.modelName) {
        useTraceStore.getState().setActiveModel('claude', detail.modelName, detail.contextLimit)
      }

      if (detail.isExactUsage) {
        useTraceStore.getState().setExactUsage('claude', detail.sessionPct, detail.weeklyPct, detail.resetAtMs)
        return
      }

      const record = buildUsageRecord({
        provider: 'claude',
        model: detail.modelName,
        plan: detail.planType,
        inputTokens: detail.inputTokens,
        outputTokens: detail.outputTokens,
        reasoningTokens: detail.reasoningTokens,
        cachedInputTokens: detail.cachedInputTokens,
        cacheCreationTokens: detail.cacheCreationTokens,
        userText: detail.userText,
        assistantText: detail.assistantText,
        source: detail.source,
        confidence: detail.confidence,
      })

      if (record.totalTokens && record.totalTokens > 0) {
        useTraceStore.getState().recordUsage(record, detail.eventId)
        useTraceStore.getState().reportAdapterStatus('claude', true)
      }
    })

    this.cleanupFns.push(cleanupListener)
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

      const { sessionPct, weeklyPct, resetAtMs } = parseClaudeUsagePayload(usage)
      if (sessionPct != null || weeklyPct != null) {
        useTraceStore.getState().setExactUsage('claude', sessionPct, weeklyPct, resetAtMs)
      }
    } catch (err) {
      console.warn('[Trace] ClaudeAdapter fetchServerUsage failed:', err)
    }
  }

  private startPlanDetector() {
    const check = () => {
      try {
        const text = (document.body?.innerText || '').toLowerCase()
        if (text.includes('claude pro') || text.includes('pro plan') || text.includes('subscribed to pro')) {
          useTraceStore.getState().setProviderTier('claude', 'pro')
        } else if (text.includes('claude team') || text.includes('team plan')) {
          useTraceStore.getState().setProviderTier('claude', 'team')
        } else if (text.includes('claude enterprise')) {
          useTraceStore.getState().setProviderTier('claude', 'enterprise')
        }
      } catch {}
    }
    const interval = setInterval(check, 1000)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
  }
}
