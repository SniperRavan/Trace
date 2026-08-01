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

      const { sessionPct, weeklyPct, resetAtMs } = parseClaudeUsagePayload(usage)
      if (sessionPct != null || weeklyPct != null) {
        useTraceStore.getState().setExactUsage('claude', sessionPct, weeklyPct, resetAtMs)
        console.log('[Trace] ClaudeAdapter fetched server-side exact usage:', { sessionPct, weeklyPct, resetAtMs })
      }
    } catch (err) {
      console.warn('[Trace] ClaudeAdapter fetchServerUsage failed:', err)
    }
  }

  private startPlanDetector() {
    const check = () => {
      try {
        const detectedModel = detectClaudeModelFromDOM()
        if (detectedModel) {
          useTraceStore.getState().setActiveModel('claude', detectedModel, 200000)
        }

        const lowerText = (document.body?.innerText || '').toLowerCase()
        const upgradeBtn = document.querySelector('a[href*="upgrade"], button[aria-label*="Upgrade"], [class*="upgrade"]')

        if (lowerText.includes('claude pro') || lowerText.includes('pro plan')) {
          useTraceStore.getState().setProviderTier('claude', 'pro')
        } else if (lowerText.includes('claude team') || lowerText.includes('team plan')) {
          useTraceStore.getState().setProviderTier('claude', 'team')
        } else if (lowerText.includes('free plan') || lowerText.includes('upgrade') || upgradeBtn) {
          useTraceStore.getState().setProviderTier('claude', 'free')
        }
      } catch {}
    }

    check()
    const interval = setInterval(check, 1500)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  stop() {
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
  }
}

function detectClaudeModelFromDOM(): string | null {
  try {
    const buttons = Array.from(document.querySelectorAll('button'))
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
      if (/Sonnet|Haiku|Opus/i.test(text)) {
        if (text.length > 2 && text.length < 40 && !text.includes('Upgrade') && !text.includes('Creating')) {
          return text
        }
      }
    }

    const composer = document.querySelector('fieldset, form, [class*="composer"], [class*="input"]')
    if (composer) {
      const btns = Array.from(composer.querySelectorAll('button'))
      for (const btn of btns) {
        const t = (btn.textContent || '').trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
        if (t && (t.includes('Sonnet') || t.includes('Haiku') || t.includes('Opus'))) {
          return t
        }
      }
    }

    const fullText = document.body?.innerText || ''
    const match = fullText.match(/(Sonnet\s*5\s*(?:Low|Medium|High|Extra|Max)?|Sonnet\s*3\.7\s*(?:Low|Medium|High|Extra|Max)?|Claude\s*3\.7\s*Sonnet|Sonnet\s*3\.5|Claude\s*3\.5\s*Sonnet|Claude\s*3\.5\s*Haiku|Claude\s*3\s*Opus)/i)
    if (match) {
      return match[1].trim()
    }
  } catch {}
  return null
}

export function parseClaudeUsagePayload(json: any): { sessionPct?: number; weeklyPct?: number; resetAtMs?: number } {
  let sessionPct: number | undefined
  let weeklyPct: number | undefined
  let resetAtMs: number | undefined

  if (!json || typeof json !== 'object') return {}

  // 1. Check authoritative `limits` array (new Anthropic API format)
  if (Array.isArray(json.limits) && json.limits.length > 0) {
    for (const entry of json.limits) {
      const rawPct = entry.percent ?? entry.percentage ?? entry.utilization
      const resetStr = entry.resets_at ?? entry.reset_at

      if (entry.kind === 'session') {
        sessionPct = normalizePercent(rawPct)
        if (resetStr) resetAtMs = new Date(resetStr).getTime()
      } else if (entry.kind === 'weekly_all' || entry.kind === 'weekly_scoped') {
        const p = normalizePercent(rawPct)
        if (p != null && (weeklyPct == null || p > weeklyPct)) {
          weeklyPct = p
        }
      }
    }
  }

  // 2. Fallback to top-level five_hour & seven_day (old format)
  if (sessionPct == null && json.five_hour) {
    const rawPct = json.five_hour.utilization ?? json.five_hour.percent ?? json.five_hour.percentage
    sessionPct = normalizePercent(rawPct)
    if (json.five_hour.resets_at) resetAtMs = new Date(json.five_hour.resets_at).getTime()
  }

  if (weeklyPct == null && json.seven_day) {
    const rawPct = json.seven_day.utilization ?? json.seven_day.percent ?? json.seven_day.percentage
    weeklyPct = normalizePercent(rawPct)
  }

  // 3. Fallback to message_limit
  if (sessionPct == null && json.message_limit) {
    if (json.message_limit.remaining != null) {
      const total = json.message_limit.limit ?? 45
      sessionPct = Math.round((1 - json.message_limit.remaining / total) * 100)
    } else if (json.message_limit.utilization != null) {
      sessionPct = normalizePercent(json.message_limit.utilization)
    }
    if (json.message_limit.reset_at) resetAtMs = new Date(json.message_limit.reset_at).getTime()
  }

  return { sessionPct, weeklyPct, resetAtMs }
}

function normalizePercent(val: unknown): number | undefined {
  if (val == null) return undefined
  const num = typeof val === 'string' ? parseFloat(val) : Number(val)
  if (isNaN(num)) return undefined
  if (num > 0 && num <= 1.0) {
    return Math.round(num * 100)
  }
  return Math.min(100, Math.max(0, Math.round(num)))
}
