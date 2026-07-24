/**
 * src/background/index.ts
 *
 * Background service worker — MV3 compatible.
 *
 * Responsibilities (Phase 1):
 *   - Listen for storage sync messages from content scripts
 *   - Set up daily reset alarms via chrome.alarms
 *   - Badge icon updates (optional, Phase 2)
 *
 * MV3 service worker constraints:
 *   - Cannot use persistent background pages
 *   - Wakes on events, sleeps when idle (~30s after last event)
 *   - No DOM access
 *   - chrome.alarms keeps reset logic alive across sleeps
 */

import browser from 'webextension-polyfill'

// ── Alarm: daily reset check ─────────────────────────────────────────────────

browser.runtime.onInstalled.addListener(async () => {
  // Create a daily alarm that fires every hour to check for quota resets.
  // We check hourly rather than at exact reset times because each provider
  // has different reset windows and we don't know them precisely.
  const existing = await browser.alarms.get('trace-reset-check')
  if (!existing) {
    browser.alarms.create('trace-reset-check', {
      delayInMinutes: 60,
      periodInMinutes: 60,
    })
  }

  console.log('[Trace] Extension installed/updated. Alarms set.')
})

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'trace-reset-check') {
    // Phase 2: check storage for providers past their resetAt timestamp
    // and zero out their usage. For now, just log.
    console.debug('[Trace] Reset check alarm fired.')
  }
})

// ── Message relay ─────────────────────────────────────────────────────────────
// Content scripts send usage updates here → we persist to storage.local.
// This pattern keeps storage writes in one place and avoids race conditions.

async function fetchBase64Logo(domain: string): Promise<string> {
  const domainVariants: string[] = [domain]
  if (domain === 'openai.com') domainVariants.push('chatgpt.com')
  if (domain === 'anthropic.com') domainVariants.push('claude.ai')
  if (domain === 'google.com') domainVariants.push('gemini.google.com')

  const urls: string[] = []
  for (const d of domainVariants) {
    urls.push(`https://cdn.brandfetch.io/${d}/w/400/h/400/icon`)
    urls.push(`https://cdn.brandfetch.io/${d}/theme/dark/icon`)
    urls.push(`https://www.google.com/s2/favicons?domain=${d}&sz=128`)
  }

  for (const url of urls) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue

      const buffer = await response.arrayBuffer()
      if (buffer.byteLength < 150) continue

      let binary = ''
      const bytes = new Uint8Array(buffer)
      const len = bytes.byteLength
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)
      const mime = response.headers.get('content-type') || 'image/png'
      return `data:${mime};base64,${base64}`
    } catch {}
  }

  throw new Error('Failed to fetch official logo from Brandfetch or Google CDN')
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRACE_USAGE_UPDATE') {
    // Phase 2: validate and write to storage.local
    console.debug('[Trace] Usage update received:', message.payload)
  }

  if (message.type === 'TRACE_REQUEST_STATE') {
    // Popup is asking for current state — read from storage and return.
    chrome.storage.local.get('trace_usage').then(res => {
      sendResponse(res)
    })
    return true
  }

  if (message.type === 'TRACE_FETCH_LOGO') {
    fetchBase64Logo(message.payload.domain)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true // keeps the message channel open for asynchronous response
  }
})

console.log('[Trace] Background service worker started.')
