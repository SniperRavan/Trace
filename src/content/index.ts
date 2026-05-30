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
  // sits at top level of <body>, completely outside the page's layout
  const host = document.createElement('div')
  host.id = 'trace-root'
  host.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    overflow: visible;
    z-index: 2147483647;
    pointer-events: none;
  `
  document.body.appendChild(host)

  // ── Attach Shadow DOM ────────────────────────────────────────────
  // 'closed' mode would block external page scripts from accessing
  // our shadow root. We use 'open' for easier debugging during dev.
  const shadow = host.attachShadow({ mode: 'open' })

  // ── Inject styles into shadow root ──────────────────────────────
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

  // ── Lazy-load the React overlay ─────────────────────────────────
  // Dynamic import keeps the initial content script parse cost low.
  // The overlay bundle only loads when needed.
  const { mountOverlay } = await import('./overlayMount')
  mountOverlay(mountEl, shadow, provider)

  // ── Start provider adapter ───────────────────────────────────────
  const adapter = createProviderAdapter(provider)
  adapter.start()
}

// Wait for body to exist before injecting.
if (document.body) {
  injectTraceOverlay()
} else {
  document.addEventListener('DOMContentLoaded', injectTraceOverlay)
}
