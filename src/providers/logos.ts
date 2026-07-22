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
    domain:  'grok.com',
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

// ─── Fallback SVGs (authentic brand SVG vectors) ───────────────────────────────

export const FALLBACK_SVGS: Record<ProviderId, string> = {
  chatgpt: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.28 9.82a6 6 0 0 0-.52-4.91 3.65 3.65 0 0 0-3.9-1.74A6 6 0 0 0 13.35 1.15a3.65 3.65 0 0 0-3.49 2.52 6 6 0 0 0-3.99 2.9 3.65 3.65 0 0 0 .45 4.28 6 6 0 0 0 .52 4.91 3.65 3.65 0 0 0 3.9 1.74 6 6 0 0 0 4.51 2.02 3.65 3.65 0 0 0 3.49-2.52 6 6 0 0 0 3.99-2.9 3.65 3.65 0 0 0-.45-4.28Zm-9.78 10.98a4.43 4.43 0 0 1-2.9-1.07l.15-.09 3.62-2.09a.77.77 0 0 0 .39-.67v-5.11l1.53.88a.07.07 0 0 1 .04.05v4.2a4.45 4.45 0 0 1-2.83 3.9Zm-7.93-3.66a4.43 4.43 0 0 1-.53-3.04l.15.09 3.62 2.09a.77.77 0 0 0 .78 0l4.43-2.56v1.77a.07.07 0 0 1-.03.06l-3.64 2.1a4.45 4.45 0 0 1-4.78-.51Zm-1.1-8.73a4.43 4.43 0 0 1 2.37-1.97l-.01.17v4.18a.77.77 0 0 0 .39.67l4.43 2.56-1.53.88a.07.07 0 0 1-.07 0l-3.64-2.1a4.45 4.45 0 0 1-1.94-4.39Zm10.82-5.46a4.43 4.43 0 0 1 2.9 1.07l-.15.09-3.62 2.09a.77.77 0 0 0-.39.67v5.11l-1.53-.88a.07.07 0 0 1-.04-.05v-4.2a4.45 4.45 0 0 1 2.83-3.9Zm7.93 3.66a4.43 4.43 0 0 1 .53 3.04l-.15-.09-3.62-2.09a.77.77 0 0 0-.78 0l-4.43 2.56v-1.77a.07.07 0 0 1 .03-.06l3.64-2.1a4.45 4.45 0 0 1 4.78.51Zm1.1 8.73a4.43 4.43 0 0 1-2.37 1.97l.01-.17v-4.18a.77.77 0 0 0-.39-.67l-4.43-2.56 1.53-.88a.07.07 0 0 1 .07 0l3.64 2.1a4.45 4.45 0 0 1 1.94 4.39Z" fill="#10b981"/>
    </svg>`,

  claude: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z" fill="#f59e0b"/>
      <path d="M19 16L19.9 19.1L23 20L19.9 20.9L19 24L18.1 20.9L15 20L18.1 19.1L19 16Z" fill="#f59e0b" opacity="0.8"/>
    </svg>`,

  gemini: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C12 2 8 9.5 2 12c6 2.5 10 10 10 10s4-7.5 10-10C16 9.5 12 2 12 2Z" fill="#818cf8"/>
    </svg>`,

  grok: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Z" fill="#9ca3af"/>
    </svg>`,

  perplexity: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2v20M2 7l10 5 10-5M2 17l10-5 10 5M2 7v10M22 7v10" stroke="#06b6d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

  deepseek: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L3 21l3.54-1.85C8.04 19.8 9.95 20.5 12 20.5c4.97 0 9-4.03 9-8.5S16.97 3 12 3Z" fill="#3b82f6"/>
      <path d="M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="#0d0f14"/>
    </svg>`,

  meta: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.1 5c-1.8 0-3.5.9-4.6 2.3C11.4 5.9 9.7 5 7.9 5 4.6 5 2 7.6 2 10.9c0 3.8 3.5 6.9 8.7 11.5l1.3 1.1 1.3-1.1c5.2-4.6 8.7-7.7 8.7-11.5C22 7.6 19.4 5 17.1 5Z" fill="#1877f2"/>
    </svg>`,
}

// ─── Dynamic logo fetcher ─────────────────────────────────────────────────────

const FAVICON_CDN = (domain: string, size = 64) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`

// In-memory cache: avoid re-fetching the same logo within a session.
const logoCache = new Map<ProviderId, string>()

/**
 * Fetches a logo URL for a provider by querying the extension's background script.
 * This bypasses strict Content Security Policies (CSP) on hosts like Perplexity AI.
 * Returns a Base64 data URL that can be used directly as an <img> src.
 * Throws if the fetch fails — callers should handle gracefully.
 */
export async function fetchProviderLogo(id: ProviderId): Promise<string> {
  if (logoCache.has(id)) {
    return logoCache.get(id)!
  }

  const provider = PROVIDERS[id]

  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('Extension runtime unavailable'))
      return
    }

    chrome.runtime.sendMessage(
      { type: 'TRACE_FETCH_LOGO', payload: { domain: provider.domain } },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (response && response.success) {
          logoCache.set(id, response.dataUrl)
          resolve(response.dataUrl)
        } else {
          reject(new Error(response?.error || 'Failed to fetch logo from background'))
        }
      }
    )
  })
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
