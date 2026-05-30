/**
 * src/content/adapters/chatgpt.ts
 * ChatGPT DOM adapter — observes message sends and quota indicators.
 */

import { useTraceStore } from '@/storage/store'
import { estimateTokens } from '@/tracking/estimator'
import type { ProviderAdapter } from './index'

export class ChatGPTAdapter implements ProviderAdapter {
  private observer: MutationObserver | null = null
  private cleanupFns: (() => void)[] = []
  private lastMessageCount = 0

  start() {
    useTraceStore.getState().loadFromStorage()
    useTraceStore.getState().updateUsage('chatgpt', { isActive: true })

    this.watchComposer()
    this.watchQuotaIndicator()

    const interval = setInterval(() => {
      useTraceStore.getState().persistToStorage()
    }, 30000)
    this.cleanupFns.push(() => clearInterval(interval))

    console.log('[Trace] ChatGPT adapter started')
  }

  stop() {
    this.observer?.disconnect()
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('chatgpt', { isActive: false })
    useTraceStore.getState().persistToStorage()
  }

  private watchComposer() {
    let lastText = ''

    const captureText = () => {
      const composer = this.findComposer()
      if (!composer) return ''
      return composer.textContent ?? (composer as HTMLTextAreaElement).value ?? ''
    }

    const onSend = () => {
      const text = lastText
      if (!text.trim()) return
      const tokens = estimateTokens(text)
      useTraceStore.getState().addTokens('chatgpt', tokens)
      useTraceStore.getState().updateUsage('chatgpt', {
        messageCount: useTraceStore.getState().providers.chatgpt.messageCount + 1,
        lastActiveAt: Date.now(),
      })
      useTraceStore.getState().persistToStorage()
      lastText = ''
    }

    const keyHandler = (e: KeyboardEvent) => {
      const composer = this.findComposer()
      if (!composer) return
      lastText = captureText()
      if (e.key === 'Enter' && !e.shiftKey) {
        setTimeout(onSend, 150)
      }
    }

    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (this.isSendButton(target)) {
        lastText = captureText()
        setTimeout(onSend, 150)
      }
    }

    document.addEventListener('keydown', keyHandler, true)
    document.addEventListener('click', clickHandler, true)
    this.cleanupFns.push(
      () => document.removeEventListener('keydown', keyHandler, true),
      () => document.removeEventListener('click', clickHandler, true),
    )
  }

  private watchQuotaIndicator() {
    // ChatGPT shows "X messages left until HH:MM AM" in the UI
    const checkQuota = () => {
      const allText = document.body.innerText
      const match = allText.match(/(\d+)\s+messages?\s+(?:left|remaining)/i)
      if (match) {
        const remaining = parseInt(match[1])
        // GPT-4 typically allows ~40 messages per 3h window
        const total = 40
        const percentUsed = Math.max(0, Math.round(((total - remaining) / total) * 100))
        const current = useTraceStore.getState().providers.chatgpt.percentUsed
        if (percentUsed > current) {
          useTraceStore.getState().updateUsage('chatgpt', { percentUsed })
        }
      }

      // Also look for reset time
      const resetMatch = allText.match(/(?:resets?|available again)\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i)
      if (resetMatch) {
        // Parse reset time and store it
        const resetAt = this.parseResetTime(resetMatch[1])
        if (resetAt) {
          useTraceStore.getState().updateUsage('chatgpt', { resetAt })
        }
      }
    }

    checkQuota()
    const interval = setInterval(checkQuota, 15000)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  private findComposer(): HTMLElement | null {
    return (
      document.querySelector('#prompt-textarea') ??
      document.querySelector('textarea[data-id="root"]') ??
      document.querySelector('textarea[placeholder*="message"]') ??
      document.querySelector('[contenteditable="true"]')
    ) as HTMLElement | null
  }

  private isSendButton(el: HTMLElement): boolean {
    let current: HTMLElement | null = el
    for (let i = 0; i < 4; i++) {
      if (!current) break
      const label = (current.getAttribute('aria-label') ?? '').toLowerCase()
      const testId = current.getAttribute('data-testid') ?? ''
      if (label.includes('send') || testId.includes('send')) return true
      current = current.parentElement
    }
    return false
  }

  private parseResetTime(timeStr: string): number | null {
    try {
      const now = new Date()
      const parsed = new Date(`${now.toDateString()} ${timeStr}`)
      if (isNaN(parsed.getTime())) return null
      // If parsed time is in the past, it's tomorrow
      if (parsed.getTime() < Date.now()) {
        parsed.setDate(parsed.getDate() + 1)
      }
      return parsed.getTime()
    } catch {
      return null
    }
  }
}
