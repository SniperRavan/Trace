/**
 * src/content/overlayMount.ts
 *
 * Mounts the React overlay tree into the Shadow DOM mount point.
 * Separated from index.ts so it's only loaded after the shadow
 * root is ready (dynamic import).
 */

import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import type { ProviderId } from '@/providers/logos'

// Lazy import — keeps initial script parse cost minimal.
// The Overlay component and all its dependencies only load here.
const getOverlayApp = () => import('../overlay/OverlayApp')

export async function mountOverlay(
  mountEl: HTMLElement,
  shadowRoot: ShadowRoot,
  provider: ProviderId,
) {
  const { OverlayApp } = await getOverlayApp()

  const root = createRoot(mountEl)

  root.render(
    createElement(OverlayApp, {
      provider,
      shadowRoot, // passed down so Framer Motion portals stay inside shadow DOM
    })
  )
}
