/**
 * src/content/adapters/chatgpt.ts
 * ChatGPT DOM adapter — tracks input capture and handles precise dynamic quota indicators.
 */

import { useTraceStore } from '@/storage/store'
import { estimateTokens } from '@/tracking/estimator'
import type { ProviderAdapter } from './index'

export class ChatGPTAdapter implements ProviderAdapter {
  private observer: MutationObserver | null = null
  private cleanupFns: (() => void)[] = []
  private pendingText = ''

  start() {
    // Note: Storage hydration and auto-expirations are now managed cleanly by store.init() inside index.ts
    useTraceStore.getState().updateUsage('chatgpt', { isActive: true })

    this.attachListeners()
    this.watchQuotaIndicator()

    console.log('[Trace] ChatGPT adapter started')
  }

  stop() {
    this.observer?.disconnect()
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('chatgpt', { isActive: false })
    useTraceStore.getState().stopAutoTimer()
    useTraceStore.getState().persistToStorage() // Flush memory instantly when tab unmounts
  }

  private getComposerText(): string {
    const el = this.findComposer()
    if (!el) return ''
    return el.innerText?.trim() ?? el.textContent?.trim() ?? (el as HTMLTextAreaElement).value?.trim() ?? ''
  }

  private record() {
    // Snapshot target text immediately before framework intercept
    this.pendingText = this.getComposerText()
  }

  private commit() {
    const text = this.pendingText
    this.pendingText = ''
    if (!text) return

    const tokens = estimateTokens(text)
    const store = useTraceStore.getState()

    // 1. Accumulate estimated tokens safely
    store.addTokens('chatgpt', tokens)

    // 2. Increment historical message tracking atomatically
    store.incrementMessageCount('chatgpt')

    // 3. Speculatively step quota up slightly (clamped below hard limit banner trigger threshold)
    const currentQuota = store.providers.chatgpt.quotaPercentUsed
    const speculativeQuota = Math.min(95, currentQuota + 2)

    store.updateUsage('chatgpt', {
      quotaPercentUsed: speculativeQuota,
      lastActiveAt: Date.now(),
    })

    console.log('[Trace] ChatGPT +', tokens, 'tokens | text:', text.slice(0, 40))
  }

  private attachListeners() {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return

      const active = document.activeElement as HTMLElement | null
      const inComposer = active?.closest('#prompt-textarea') ||
        active?.closest('[contenteditable="true"]') ||
        active?.tagName === 'TEXTAREA'

      if (!inComposer) return
      this.record()
      setTimeout(() => this.commit(), 100)
    }

    // Capture text on mousedown rather than click to outrun standard DOM updates
    const onMousedown = (e: MouseEvent) => {
      if (!this.isSendButton(e.target as HTMLElement)) return
      this.record()
      setTimeout(() => this.commit(), 100)
    }

    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('mousedown', onMousedown, true)

    this.cleanupFns.push(
      () => document.removeEventListener('keydown', onKeydown, true),
      () => document.removeEventListener('mousedown', onMousedown, true)
    )
  }

  private watchQuotaIndicator() {
    const checkQuota = () => {
      const allText = document.body.innerText

      // 1. Direct Hard Cap Block Check
      const isCapped = allText.includes("You've reached your current limit") ||
        allText.includes("You are out of free messages")

      if (isCapped) {
        useTraceStore.getState().updateUsage('chatgpt', {
          quotaPercentUsed: 100
        })

        const resetMatch = allText.match(/(?:resets?|available again|try again after)\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i)
        if (resetMatch) {
          const resetAt = this.parseResetTime(resetMatch[1])
          if (resetAt) {
            useTraceStore.getState().updateUsage('chatgpt', { resetAt })
          }
        }
        return
      }

      // 2. Relative Countdown Tracker Parsing
      const match = allText.match(/(\d+)\s+messages?\s+(?:left|remaining)/i)
      if (match) {
        const remaining = parseInt(match[1])
        const total = 40
        const realPercent = Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100)))
        useTraceStore.getState().updateUsage('chatgpt', { quotaPercentUsed: realPercent })
      }
    }

    // Hook mutation observer as our core interface driver instead of simple intervals
    this.observer = new MutationObserver(() => checkQuota())
    this.observer.observe(document.body, { childList: true, subtree: true })

    this.cleanupFns.push(() => this.observer?.disconnect())
  }

  private findComposer(): HTMLElement | null {
    return (
      document.querySelector('#prompt-textarea') ??
      document.querySelector('textarea[data-id="root"]') ??
      document.querySelector('textarea[placeholder*="message"]') ??
      document.querySelector('[contenteditable="true"]')
    ) as HTMLElement | null
  }

  private isSendButton(el: HTMLElement | null): boolean {
    let cur = el
    for (let i = 0; i < 5 && cur; i++) {
      const label = (cur.getAttribute('aria-label') ?? '').toLowerCase()
      const testid = cur.getAttribute('data-testid') ?? ''
      const type = cur.getAttribute('type') ?? ''
      const isDisabled = cur.hasAttribute('disabled')

      if (
        (label.includes('send') || testid.includes('send') || (type === 'submit' && cur.tagName === 'BUTTON')) &&
        !isDisabled
      ) {
        return true
      }
      cur = cur.parentElement
    }
    return false
  }

  private parseResetTime(timeStr: string): number | null {
    try {
      const now = new Date()
      const parsed = new Date(`${now.toDateString()} ${timeStr}`)
      if (isNaN(parsed.getTime())) return null
      if (parsed.getTime() < Date.now()) {
        parsed.setDate(parsed.getDate() + 1)
      }
      return parsed.getTime()
    } catch {
      return null
    }
  }
}
