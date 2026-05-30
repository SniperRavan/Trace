/**
 * src/overlay/overlay.tsx
 * Overlay entry point — renders OverlayApp when loaded standalone.
 * In production the overlay is mounted via content/overlayMount.ts.
 */
import { createRoot } from 'react-dom/client'
import { OverlayApp } from './OverlayApp'

// Standalone mode only — when loaded as its own HTML page.
const root = document.getElementById('root')
if (root) {
  const shadow = root.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  shadow.appendChild(mount)
  createRoot(mount).render(
    <OverlayApp provider="claude" shadowRoot={shadow} />
  )
}
