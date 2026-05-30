/**
 * src/providers/logos.ts
 *
 * Two-layer logo strategy:
 *
 * Layer 1 (instant): Inline SVG strings embedded at build time.
 *   - Renders in 0ms. No network. Never fails.
 *   - Deliberately simplified — just enough to be recognizable.
 *
 * Layer 2 (async swap): Fetches the real logo from Google's
 *   favicon CDN (S2 service) — reliable, fast, no API key needed.
 *   Once loaded, the <img> src is swapped seamlessly.
 *   If the fetch fails or is slow, Layer 1 stays visible forever.
 *
 * Why Google S2?
 *   - https://www.google.com/s2/favicons?domain=openai.com&sz=64
 *   - Returns high-quality PNGs. No auth. Used by millions of apps.
 *   - Fallback: Unavailable (non-HTTPS domains, blocked) → SVG stays.
 *
 * Usage in React:
 *   <ProviderLogo provider="chatgpt" size={28} />
 */

export type ProviderId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'grok'
  | 'perplexity'
  | 'deepseek'
  | 'meta'

// ─── Provider metadata ───────────────────────────────────────────────────────

export interface ProviderMeta {
  id:         ProviderId
  name:       string
  domain:     string  // used to fetch favicon
  color:      string  // brand accent (from design system)
  bgColor:    string  // icon container background
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  chatgpt: {
    id:      'chatgpt',
    name:    'ChatGPT',
    domain:  'chatgpt.com',
    color:   '#10b981',
    bgColor: 'rgba(16,185,129,0.12)',
  },
  claude: {
    id:      'claude',
    name:    'Claude',
    domain:  'claude.ai',
    color:   '#f59e0b',
    bgColor: 'rgba(245,158,11,0.12)',
  },
  gemini: {
    id:      'gemini',
    name:    'Gemini',
    domain:  'gemini.google.com',
    color:   '#818cf8',
    bgColor: 'rgba(129,140,248,0.12)',
  },
  grok: {
    id:      'grok',
    name:    'Grok',
    domain:  'x.com',
    color:   '#9ca3af',
    bgColor: 'rgba(156,163,175,0.12)',
  },
  perplexity: {
    id:      'perplexity',
    name:    'Perplexity',
    domain:  'perplexity.ai',
    color:   '#06b6d4',
    bgColor: 'rgba(6,182,212,0.12)',
  },
  deepseek: {
    id:      'deepseek',
    name:    'DeepSeek',
    domain:  'deepseek.com',
    color:   '#3b82f6',
    bgColor: 'rgba(59,130,246,0.12)',
  },
  meta: {
    id:      'meta',
    name:    'Meta AI',
    domain:  'meta.ai',
    color:   '#1877f2',
    bgColor: 'rgba(24,119,242,0.12)',
  },
}

// ─── Fallback SVGs (inline, zero-dependency) ─────────────────────────────────
// These are intentionally minimal — a recognizable shape in brand color.
// They render instantly with no network request.

export const FALLBACK_SVGS: Record<ProviderId, string> = {
  chatgpt: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108
               3.6464 3.6464 0 0 0-3.9067-1.7335
               5.9817 5.9817 0 0 0-4.5089-2.0244
               3.6473 3.6473 0 0 0-3.4875 2.5228
               5.9863 5.9863 0 0 0-3.9882 2.9003
               3.6467 3.6467 0 0 0 .4496 4.2832
               5.9817 5.9817 0 0 0 .5158 4.9108
               3.6472 3.6472 0 0 0 3.9066 1.7335
               5.9817 5.9817 0 0 0 4.5089 2.0243
               3.6465 3.6465 0 0 0 3.4875-2.5228
               5.9881 5.9881 0 0 0 3.9883-2.9003
               3.6465 3.6465 0 0 0-.4496-4.2832Z"
        fill="#10b981"/>
      <circle cx="12" cy="12" r="2.5" fill="#0d0f14"/>
    </svg>`,

  claude: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.827 3.52h-3.654L5.443 20.5h3.167l1.14-3.2h4.5l1.14 3.2h3.167L13.827 3.52Z
               M10.777 14.5l1.473-4.13 1.473 4.13h-2.946Z"
        fill="#f59e0b"/>
    </svg>`,

  gemini: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C12 2 8 9.5 2 12c6 2.5 10 10 10 10s4-7.5 10-10C16 9.5 12 2 12 2Z"
        fill="#818cf8"/>
    </svg>`,

  grok: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68
               l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Z"
        fill="#9ca3af"/>
    </svg>`,

  perplexity: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2Z" stroke="#06b6d4" stroke-width="1.5" fill="none"/>
      <path d="M12 2v20M2 7l10 5 10-5" stroke="#06b6d4" stroke-width="1.5"/>
    </svg>`,

  deepseek: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="#3b82f6" stroke-width="1.5"/>
      <path d="M7 12h10M12 7l5 5-5 5" stroke="#3b82f6" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,

  meta: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 12c0-2.485 1.274-4.8 3.3-6.4 2.026 1.6 3.3 3.915 3.3 6.4
               0 2.485-1.274 4.8-3.3 6.4C3.774 16.8 2.5 14.485 2.5 12Z"
        fill="#1877f2"/>
      <path d="M9.1 12c0-2.485 1.274-4.8 3.3-6.4 2.026 1.6 3.3 3.915 3.3 6.4
               0 2.485-1.274 4.8-3.3 6.4C10.374 16.8 9.1 14.485 9.1 12Z"
        fill="#1877f2" opacity="0.6"/>
      <path d="M15.7 12c0-2.485 1.274-4.8 3.3-6.4 2.026 1.6 3.3 3.915 3.3 6.4
               0 2.485-1.274 4.8-3.3 6.4-2.026-1.6-3.3-3.915-3.3-6.4Z"
        fill="#1877f2" opacity="0.3"/>
    </svg>`,
}

// ─── Dynamic logo fetcher ─────────────────────────────────────────────────────

const FAVICON_CDN = (domain: string, size = 64) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`

// In-memory cache: avoid re-fetching the same logo within a session.
const logoCache = new Map<ProviderId, string>()

/**
 * Fetches a logo URL for a provider, using Google's S2 favicon service.
 * Returns a blob object URL that can be used as an <img> src.
 * Throws if the fetch fails — callers should handle gracefully.
 */
export async function fetchProviderLogo(id: ProviderId): Promise<string> {
  if (logoCache.has(id)) {
    return logoCache.get(id)!
  }

  const provider = PROVIDERS[id]
  const url = FAVICON_CDN(provider.domain, 64)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Logo fetch failed: ${response.status}`)

  const blob = await response.blob()

  // Validate it's actually an image (S2 sometimes returns a 1x1 placeholder)
  if (blob.size < 200) throw new Error('Logo too small — likely placeholder')

  const objectUrl = URL.createObjectURL(blob)
  logoCache.set(id, objectUrl)
  return objectUrl
}

/**
 * Preloads logos for all providers in the background.
 * Call once after extension initializes — doesn't block anything.
 */
export async function preloadAllLogos(): Promise<void> {
  const ids = Object.keys(PROVIDERS) as ProviderId[]
  // Sequential with small delay to avoid hammering on cold start
  for (const id of ids) {
    try {
      await fetchProviderLogo(id)
      await new Promise(r => setTimeout(r, 100))
    } catch {
      // Silently skip — fallback SVG will remain
    }
  }
}
