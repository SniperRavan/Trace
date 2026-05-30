/**
 * src/content/adapters/claude.ts
 *
 * Claude.ai DOM adapter.
 * Observes message submissions and estimates token usage.
 *
 * Strategy:
 *   1. Watch for send button clicks / Enter key on the input field
 *   2. Capture the text content of the composer before it clears
 *   3. Estimate tokens and add to store
 *   4. Also try to read the quota warning banner if Claude shows one
 */

import { useTraceStore } from '@/storage/store'
import { estimateTokens } from '@/tracking/estimator'
import type { ProviderAdapter } from './index'

export class ClaudeAdapter implements ProviderAdapter {
  private observer: MutationObserver | null = null
  private lastText = ''
  private cleanupFns: (() => void)[] = []

  start() {
    // Load persisted data first
    useTraceStore.getState().loadFromStorage()

    // Mark provider as active
    useTraceStore.getState().updateUsage('claude', {
      isActive: true,
      messageCount: useTraceStore.getState().providers.claude.messageCount,
    })

    this.watchComposer()
    this.watchQuotaBanner()

    // Persist every 30s
    const interval = setInterval(() => {
      useTraceStore.getState().persistToStorage()
    }, 30000)

    this.cleanupFns.push(() => clearInterval(interval))

    console.log('[Trace] Claude adapter started')
  }

  stop() {
    this.observer?.disconnect()
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
    useTraceStore.getState().persistToStorage()
  }

  private watchComposer() {
    // Claude's composer is a contenteditable div
    // We capture text on send rather than on every keystroke
    const captureAndEstimate = () => {
      const composer = this.findComposer()
      if (!composer) return
      const text = composer.textContent ?? ''
      if (!text.trim() || text === this.lastText) return
      this.lastText = text

      const tokens = estimateTokens(text)
      useTraceStore.getState().addTokens('claude', tokens)
      useTraceStore.getState().updateUsage('claude', {
        messageCount: useTraceStore.getState().providers.claude.messageCount + 1,
        lastActiveAt: Date.now(),
      })
      useTraceStore.getState().persistToStorage()
    }

    // Watch for Enter key in composer
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Small delay — let Claude clear the composer first so we
        // know a message was actually sent (not just a newline)
        setTimeout(() => {
          const composer = this.findComposer()
          if (!composer?.textContent?.trim()) {
            captureAndEstimate()
          }
        }, 100)
      }
    }

    // Watch for send button click
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (this.isSendButton(target)) {
        setTimeout(captureAndEstimate, 100)
      }
    }

    document.addEventListener('keydown', keyHandler, true)
    document.addEventListener('click', clickHandler, true)

    this.cleanupFns.push(
      () => document.removeEventListener('keydown', keyHandler, true),
      () => document.removeEventListener('click', clickHandler, true),
    )

    // Also observe DOM for new assistant messages appearing
    // (confirms a message was sent and response received)
    this.observer = new MutationObserver(() => {
      this.checkForNewResponse()
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  private watchQuotaBanner() {
    // Claude sometimes shows a usage warning banner.
    // If we detect it, we can refine our percentage estimate.
    const checkBanner = () => {
      const banners = document.querySelectorAll('[class*="usage"], [class*="limit"], [class*="quota"]')
      banners.forEach(banner => {
        const text = banner.textContent ?? ''
        // Look for patterns like "X messages left" or "resets at HH:MM"
        const msgMatch = text.match(/(\d+)\s+messages?\s+left/i)
        if (msgMatch) {
          const remaining = parseInt(msgMatch[1])
          // Rough estimate: if X messages left out of ~20 typical
          const total = 20
          const used = total - remaining
          const percentUsed = Math.round((used / total) * 100)
          if (percentUsed > useTraceStore.getState().providers.claude.percentUsed) {
            useTraceStore.getState().updateUsage('claude', { percentUsed })
          }
        }
      })
    }

    // Check on load and every 10s
    checkBanner()
    const interval = setInterval(checkBanner, 10000)
    this.cleanupFns.push(() => clearInterval(interval))
  }

  private findComposer(): HTMLElement | null {
    // Claude's composer selectors (may change with UI updates)
    return (
      document.querySelector('[contenteditable="true"][data-placeholder]') ??
      document.querySelector('div[contenteditable="true"].ProseMirror') ??
      document.querySelector('[contenteditable="true"]')
    ) as HTMLElement | null
  }

  private isSendButton(el: HTMLElement): boolean {
    // Walk up 3 levels to find send button
    let current: HTMLElement | null = el
    for (let i = 0; i < 3; i++) {
      if (!current) break
      const label = (current.getAttribute('aria-label') ?? '').toLowerCase()
      const type  = current.getAttribute('type') ?? ''
      if (label.includes('send') || (type === 'button' && label.includes('send'))) return true
      current = current.parentElement
    }
    return false
  }

  private lastResponseCount = 0

  private checkForNewResponse() {
    // Count assistant message blocks as a proxy for sent messages
    const responses = document.querySelectorAll(
      '[data-testid*="assistant"], [class*="assistant-message"], .font-claude-message'
    )
    if (responses.length > this.lastResponseCount) {
      this.lastResponseCount = responses.length
      // Response received — good signal that a message was sent
    }
  }
}
