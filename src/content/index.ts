import { detectProvider } from './providerDetect'
import overlayStyles from '../overlay/overlay.css?inline'
import { mountOverlay } from './overlayMount'
import { createProviderAdapter } from './adapters'
import { useTraceStore, startAnalyticsEngine, stopAnalyticsEngine } from '@/storage/store'

let injectedElement: HTMLElement | null = null
let activeAdapter: any = null

async function handleRoute() {
  const hostname = window.location.hostname
  const path = window.location.pathname

  const provider = detectProvider(hostname)

  // SPA check for Grok (x.com)
  if (provider === 'grok') {
    const isGrokUrl = path.includes('/grok') || path.includes('/i/grok')
    if (!isGrokUrl) {
      cleanup()
      return
    }
  }

  if (!provider) {
    cleanup()
    return
  }

  // Prevent duplicate injections
  if (injectedElement || document.getElementById('trace-root')) {
    return
  }

  await useTraceStore.getState().init()
  startAnalyticsEngine()

  const host = document.createElement('div')
  host.id = 'trace-root'
  host.style.cssText = `
    position: fixed !important;
    top: 0 !important; left: 0 !important;
    width: 0 !important; height: 0 !important;
    overflow: visible !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  `
  document.body.appendChild(host)
  injectedElement = host

  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = overlayStyles
  shadow.appendChild(styleEl)

  const mountEl = document.createElement('div')
  mountEl.id = 'trace-mount'
  mountEl.style.pointerEvents = 'auto'
  shadow.appendChild(mountEl)

  mountOverlay(mountEl, shadow, provider)

  activeAdapter = await createProviderAdapter(provider)
  activeAdapter.start()
}

function cleanup() {
  if (injectedElement) {
    injectedElement.remove()
    injectedElement = null
  }
  const rootEl = document.getElementById('trace-root')
  if (rootEl) {
    rootEl.remove()
  }
  if (activeAdapter) {
    activeAdapter.stop()
    activeAdapter = null
  }
  stopAnalyticsEngine()
}

// Initial route trigger
if (document.body) {
  handleRoute()
} else {
  document.addEventListener('DOMContentLoaded', handleRoute)
}

// Periodic check for SPA URL path changes
let lastUrl = window.location.href
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    handleRoute()
  }
}, 1000)

window.addEventListener('beforeunload', cleanup)
