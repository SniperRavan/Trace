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

browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.type === 'TRACE_USAGE_UPDATE') {
    // Phase 2: validate and write to storage.local
    console.debug('[Trace] Usage update received:', message.payload)
  }

  if (message.type === 'TRACE_REQUEST_STATE') {
    // Popup is asking for current state — read from storage and return.
    return browser.storage.local.get('trace_usage')
  }
})

console.log('[Trace] Background service worker started.')
