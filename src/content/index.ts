/**
 * src/content/index.ts
 *
 * Content script entry point. Runs on all supported AI provider pages.
 *
 * Shadow DOM strategy:
 *   We mount Trace's overlay inside a Shadow DOM root attached to a
 *   <div> we inject into the page. This gives us:
 *
 *   1. CSS isolation — the host page's styles cannot leak in.
 *      Our styles cannot leak out. Zero interference, guaranteed.
 *
 *   2. Clean DOM — our <div#trace-root> is the only thing we add
 *      to the page. We set pointer-events: none on it at the
 *      container level; only the actual bubble element intercepts
 *      clicks.
 *
 *   3. Tailwind inside Shadow DOM — we inject a <style> tag directly
 *      into the shadow root with our compiled CSS. Tailwind's styles
 *      normally live in <head>, which Shadow DOM doesn't inherit.
 *
 * Lifecycle:
 *   content script loads → injectTraceOverlay() →
 *   creates shadow root → renders React overlay into it →
 *   provider adapter starts observing DOM changes
 */

import { detectProvider } from './providerDetect'
import { createProviderAdapter } from './adapters'
import { mountOverlay } from './overlayMount'
import { useTraceStore } from '@/storage/store'

// We import the compiled CSS as a raw string using Vite's ?inline suffix.
// This lets us inject it into the Shadow DOM rather than <head>.
import overlayStyles from '../overlay/overlay.css?inline'

let injected = false

async function injectTraceOverlay() {
  // Guard: only inject once, even if script runs multiple times.
  if (injected) return
  injected = true

  // Detect which provider page we're on.
  const provider = detectProvider(window.location.hostname)
  if (!provider) return

  // ── Create host element ──────────────────────────────────────────
  // sits at top level of <body>, completely outside the page's layout.
  // !important ensures heavy host sites (like ChatGPT) cannot override our container.
  const host = document.createElement('div')
  host.id = 'trace-root'
  host.style.cssText = `
    position: fixed !important;
    top: 0 !important; 
    left: 0 !important;
    width: 0 !important; 
    height: 0 !important;
    overflow: visible !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  `
  document.body.appendChild(host)

  // ── Attach Shadow DOM ────────────────────────────────────────────
  // 'closed' mode would block external page scripts from accessing
  // our shadow root. We use 'open' for easier debugging during dev.
  const shadow = host.attachShadow({ mode: 'open' })

  // ── Inject styles into shadow root ───────────────────────────────
  // Tailwind CSS and our custom overlay styles go here, NOT <head>.
  const styleEl = document.createElement('style')
  styleEl.textContent = overlayStyles
  shadow.appendChild(styleEl)

  // ── Mount point for React ────────────────────────────────────────
  const mountEl = document.createElement('div')
  mountEl.id = 'trace-mount'
  // The mount div itself needs pointer-events enabled so the bubble
  // can receive clicks (host container has pointer-events: none).
  mountEl.style.pointerEvents = 'auto'
  shadow.appendChild(mountEl)

  // ── Mount the React overlay ──────────────────────────────────────
  // Static import avoids Manifest V3 cross-origin dynamic import blocks.
  mountOverlay(mountEl, shadow, provider)

  // ── Initialize Global Trace Store & Active Timers ────────────────
  await useTraceStore.getState().init()

  // ── Start provider adapter ───────────────────────────────────────
  // Adapter must be awaited because it dynamically imports the specific
  // logic for Claude/ChatGPT to keep the initial content script light.
  const adapter = await createProviderAdapter(provider)
  adapter.start()
  // ── Cleanup ──────────────────────────────────────────────────────
  // Ensure background timers/observers are killed if the user navigates away.
  window.addEventListener('beforeunload', () => adapter.stop())
}

// Wait for body to exist before injecting.
if (document.body) {
  injectTraceOverlay()
} else {
  document.addEventListener('DOMContentLoaded', injectTraceOverlay)
}
