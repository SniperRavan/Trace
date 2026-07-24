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
    domain:  'openai.com',
    color:   '#10b981',
    bgColor: 'rgba(16,185,129,0.12)',
  },
  claude: {
    id:      'claude',
    name:    'Claude',
    domain:  'anthropic.com',
    color:   '#f59e0b',
    bgColor: 'rgba(245,158,11,0.12)',
  },
  gemini: {
    id:      'gemini',
    name:    'Gemini',
    domain:  'google.com',
    color:   '#818cf8',
    bgColor: 'rgba(129,140,248,0.12)',
  },
}

// ─── Fallback SVGs (authentic official brand vector icons) ───────────────────

export const FALLBACK_SVGS: Record<ProviderId, string> = {
  chatgpt: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.28 9.82a6 6 0 0 0-.52-4.91 3.65 3.65 0 0 0-3.9-1.74A6 6 0 0 0 13.35 1.15a3.65 3.65 0 0 0-3.49 2.52 6 6 0 0 0-3.99 2.9 3.65 3.65 0 0 0 .45 4.28 6 6 0 0 0 .52 4.91 3.65 3.65 0 0 0 3.9 1.74 6 6 0 0 0 4.51 2.02 3.65 3.65 0 0 0 3.49-2.52 6 6 0 0 0 3.99-2.9 3.65 3.65 0 0 0-.45-4.28Zm-9.78 10.98a4.43 4.43 0 0 1-2.9-1.07l.15-.09 3.62-2.09a.77.77 0 0 0 .39-.67v-5.11l1.53.88a.07.07 0 0 1 .04.05v4.2a4.45 4.45 0 0 1-2.83 3.9Zm-7.93-3.66a4.43 4.43 0 0 1-.53-3.04l.15.09 3.62 2.09a.77.77 0 0 0 .78 0l4.43-2.56v1.77a.07.07 0 0 1-.03.06l-3.64 2.1a4.45 4.45 0 0 1-4.78-.51Zm-1.1-8.73a4.43 4.43 0 0 1 2.37-1.97l-.01.17v4.18a.77.77 0 0 0 .39.67l4.43 2.56-1.53.88a.07.07 0 0 1-.07 0l-3.64-2.1a4.45 4.45 0 0 1-1.94-4.39Zm10.82-5.46a4.43 4.43 0 0 1 2.9 1.07l-.15.09-3.62 2.09a.77.77 0 0 0-.39.67v5.11l-1.53-.88a.07.07 0 0 1-.04-.05v-4.2a4.45 4.45 0 0 1 2.83-3.9Zm7.93 3.66a4.43 4.43 0 0 1 .53 3.04l-.15-.09-3.62-2.09a.77.77 0 0 0-.78 0l-4.43 2.56v-1.77a.07.07 0 0 1 .03-.06l3.64-2.1a4.45 4.45 0 0 1 4.78.51Zm1.1 8.73a4.43 4.43 0 0 1-2.37 1.97l.01-.17v-4.18a.77.77 0 0 0-.39-.67l-4.43-2.56 1.53-.88a.07.07 0 0 1 .07 0l3.64 2.1a4.45 4.45 0 0 1 1.94 4.39Z" fill="#10a37f"/>
    </svg>`,

  claude: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 12C4.5 12 9 10.5 12 4.5C15 10.5 19.5 12 19.5 12C19.5 12 15 13.5 12 19.5C9 13.5 4.5 12 4.5 12Z" fill="#d97757"/>
      <path d="M16 5.5C16 5.5 18 4.75 19.5 2C21 4.75 23 5.5 23 5.5C23 5.5 21 6.25 19.5 9C18 6.25 16 5.5 16 5.5Z" fill="#d97757" opacity="0.85"/>
    </svg>`,

  gemini: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C12 2 7.5 9 2 12C7.5 15 12 22 12 22C12 22 16.5 15 22 12C16.5 9 12 2 12 2Z" fill="url(#gemini-grad)"/>
      <defs>
        <linearGradient id="gemini-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stop-color="#4285F4"/>
          <stop offset="0.5" stop-color="#9B51E0"/>
          <stop offset="1" stop-color="#E91E63"/>
        </linearGradient>
      </defs>
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
