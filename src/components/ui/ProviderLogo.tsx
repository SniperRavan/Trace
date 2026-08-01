/**
 * src/components/ui/ProviderLogo.tsx
 *
 * Renders a provider logo with instant SVG fallback + async swap.
 *
 * Lifecycle:
 *  1. Renders inline SVG immediately (0ms).
 *  2. Fires fetchProviderLogo() in background.
 *  3. On success: swaps to real <img> with a crossfade.
 *  4. On failure: keeps SVG forever. No error shown to user.
 *
 * The <img> is pre-mounted but invisible (opacity: 0).
 * Only when fully loaded does it fade in over the SVG.
 * This prevents any flash of broken image / layout shift.
 */

import { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import { fetchProviderLogo, FALLBACK_SVGS, PROVIDERS, type ProviderId } from '@/providers/logos'

interface ProviderLogoProps {
  provider:  ProviderId
  size?:     number   // pixel dimensions (default: 24)
  className?: string
}

export function ProviderLogo({ provider, size = 24, className = '' }: ProviderLogoProps) {
  const [dynamicSrc, setDynamicSrc]   = useState<string | null>(null)
  const [imgReady,   setImgReady]     = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    fetchProviderLogo(provider)
      .then(src => {
        if (mountedRef.current) setDynamicSrc(src)
      })
      .catch(() => {
        // Silently fall through to SVG — no state change needed.
      })

    return () => { mountedRef.current = false }
  }, [provider])

  const meta = PROVIDERS[provider]

  const containerStyle: React.CSSProperties = {
    width:           size,
    height:          size,
    borderRadius:    Math.round(size * 0.33),
    backgroundColor: meta.bgColor,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    position:        'relative',
    overflow:        'hidden',
  }

  const innerSize = Math.round(size * 0.72)

  return (
    <div style={containerStyle} className={className} aria-label={meta.name}>
      {/* Layer 1: SVG fallback — always rendered, hidden once img loads */}
      <span
        style={{
          position:   'absolute',
          inset:      0,
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.25s ease',
          opacity:    imgReady ? 0 : 1,
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(
            FALLBACK_SVGS[provider].replace(
              '<svg',
              `<svg width="${innerSize}" height="${innerSize}"`
            ),
            { USE_PROFILES: { svg: true } }
          ),
        }}
      />

      {/* Layer 2: Real logo — pre-mounted, fades in when loaded */}
      {dynamicSrc && (
        <img
          src={dynamicSrc}
          alt={meta.name}
          width={innerSize}
          height={innerSize}
          onLoad={() => setImgReady(true)}
          onError={() => setImgReady(false)}
          style={{
            position:        'absolute',
            width:           innerSize,
            height:          innerSize,
            borderRadius:    2,
            objectFit:       'contain',
            transition:      'opacity 0.3s ease',
            opacity:         imgReady ? 1 : 0,
          }}
        />
      )}
    </div>
  )
}
