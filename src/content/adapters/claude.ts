/**
 * src/content/adapters/claude.ts
 *
 * Claude.ai DOM adapter.
 * Observes message submissions and estimates token usage.
 *
 * Strategy:
 * 1. Detect message sends via Enter key or Send button click
 * 2. Capture composer text before Claude clears it
 * 3. Estimate token usage and update the store
 * 4. Observe assistant responses as a confirmation signal
 * 5. Persist usage data periodically
 */

import { useTraceStore } from '@/storage/store'
import { estimateTokens } from '@/tracking/estimator'
import type { ProviderAdapter } from './index'

export class ClaudeAdapter implements ProviderAdapter {
  private observer: MutationObserver | null = null
  private cleanupFns: (() => void)[] = []
  private pendingText = ''

  start() {
    useTraceStore.getState().loadFromStorage()
    useTraceStore.getState().updateUsage('claude', { isActive: true })
    this.attachListeners()
    const iv = setInterval(() => useTraceStore.getState().persistToStorage(), 30000)
    this.cleanupFns.push(() => clearInterval(iv))
    console.log('[Trace] Claude adapter started')
  }

  stop() {
    this.observer?.disconnect()
    this.cleanupFns.forEach(fn => fn())
    useTraceStore.getState().updateUsage('claude', { isActive: false })
    useTraceStore.getState().persistToStorage()
  }

  private getComposerText(): string {
    // Try every known Claude composer selector in order
    const candidates = [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][data-placeholder]',
      '[data-testid="composer-input"]',
      'div[contenteditable="true"]',
    ]
    for (const sel of candidates) {
      const el = document.querySelector<HTMLElement>(sel)
      const text = el?.innerText?.trim() ?? el?.textContent?.trim() ?? ''
      if (text) return text
    }
    return ''
  }

  private record() {
    // Snapshot text BEFORE the send clears the composer
    this.pendingText = this.getComposerText()
  }

  private commit() {
    const text = this.pendingText
    this.pendingText = ''
    if (!text) return
    const tokens = estimateTokens(text)
    const store = useTraceStore.getState()
    store.addTokens('claude', tokens)
    store.updateUsage('claude', {
      messageCount: store.providers.claude.messageCount + 1,
      lastActiveAt: Date.now(),
    })
    store.persistToStorage()
    console.log('[Trace] Claude +', tokens, 'tokens | text:', text.slice(0, 40))
  }

  private attachListeners() {
    // Capture text on keydown BEFORE Enter clears the composer
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      // Only fire if focus is inside the composer
      const active = document.activeElement as HTMLElement | null
      const inComposer = active?.closest('[contenteditable="true"]') ||
        active?.closest('[data-testid="composer-input"]')
      if (!inComposer) return
      this.record()
      // Commit after React re-render clears the field
      setTimeout(() => this.commit(), 100)
    }

    // Capture text on send-button mousedown BEFORE click clears composer
    const onMousedown = (e: MouseEvent) => {
      if (!this.isSendButton(e.target as HTMLElement)) return
      this.record()
      setTimeout(() => this.commit(), 100)
    }

    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('mousedown', onMousedown, true)

    this.cleanupFns.push(
      () => document.removeEventListener('keydown', onKeydown, true),
      () => document.removeEventListener('mousedown', onMousedown, true),
    )

    // Also watch for new assistant turns as a secondary signal
    this.observer = new MutationObserver(() => {
      const turns = document.querySelectorAll(
        '[data-testid^="conversation-turn-"], .font-claude-message'
      )
      // If a new turn appeared and we have pending text, commit it
      if (this.pendingText && turns.length > 0) {
        this.commit()
      }
    })
    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  private isSendButton(el: HTMLElement | null): boolean {
    let cur = el
    for (let i = 0; i < 5 && cur; i++) {
      const label = (cur.getAttribute('aria-label') ?? '').toLowerCase()
      const testid = cur.getAttribute('data-testid') ?? ''
      const type = cur.getAttribute('type') ?? ''
      if (
        label.includes('send') ||
        testid.includes('send') ||
        (type === 'submit' && cur.tagName === 'BUTTON')
      ) return true
      cur = cur.parentElement
    }
    return false
  }
}
