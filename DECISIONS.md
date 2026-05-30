# DECISIONS.md — Trace Architectural Decisions

> Tracks why things were built the way they were.
> Prevents revisiting settled questions. Updated each phase.

---

## Shadow DOM Strategy

**Decision:** Open-mode Shadow DOM, not closed.

**Alternatives rejected:**
- `closed` mode: blocks external scripts from accessing our shadow root, but also blocks Framer Motion's portal system from mounting inside it correctly. Not worth the tradeoff for a local extension.
- iframe overlay: complete isolation but can't be positioned relative to the page without complex postMessage coordination. Heavier memory footprint.
- Direct DOM injection (no Shadow DOM): simple, but host page CSS will bleed into the overlay on sites with aggressive global resets.

**Tradeoff accepted:** Any script running on the host page with `document.querySelector('#trace-root').shadowRoot` can read our DOM. Acceptable — we store nothing sensitive in the DOM.

---

## Dynamic Logo Strategy

**Decision:** Google S2 favicon CDN (`https://www.google.com/s2/favicons?domain=X&sz=64`)

**Alternatives rejected:**
- Clearbit Logo API: requires API key, has rate limits, is a paid service.
- Bundling all logos as static assets: logos change (OpenAI, Meta rebrand frequently). Requires extension update to refresh.
- DuckDuckGo favicon: `https://icons.duckduckgo.com/ip3/X.ico` — sometimes lower quality, ICO format complicates rendering.
- Fetching directly from provider domains: extension's CSP would need `connect-src` for each domain. Privacy optics are worse.

**Performance contract:**
1. Fallback SVG renders at t=0 (zero network).
2. Fetch fires in background, never blocks render.
3. Blob URL is cached in memory for session — no re-fetches.
4. If image blob is <200 bytes, we reject it (S2 returns 1x1 pixel for unknown domains).

---

## State Management

**Decision:** Zustand

**Alternatives rejected:**
- Redux Toolkit: far more boilerplate. Overkill for 7 providers × 8 fields.
- React Context + useReducer: would work, but causes unnecessary re-renders without careful memoization. Zustand's selector model is better.
- Jotai / Recoil: atomic model is good, but Zustand's single-store shape maps cleanly to our `Record<ProviderId, ProviderUsage>` structure.

---

## CSS in Shadow DOM

**Decision:** Import overlay CSS as raw string via Vite `?inline`, inject as `<style>` into shadow root.

**Alternatives rejected:**
- Constructable Stylesheets (`CSSStyleSheet.replace()`): better performance, but browser support for adopting them in shadow roots is still inconsistent (Firefox as of 2024).
- CSS Modules: don't help with Shadow DOM isolation — scoped class names solve naming conflicts, not style leakage.
- Runtime Tailwind CDN: violates CSP (`script-src 'self'`) and is 100KB+ of overhead.

**Consequence:** Tailwind's JIT purging scans `src/**/*.{ts,tsx}` to determine which classes to include. Any class used dynamically (e.g., string interpolation) must be safelisted in `tailwind.config.js`.

---

## Build Architecture (Multi-entry Vite)

**Decision:** Single Vite build with four entry points: `popup`, `overlay`, `background`, `content`.

**Alternatives rejected:**
- Separate Vite configs per entry: more control, but complex to keep in sync. Shared vendor chunks impossible across separate builds.
- vite-plugin-web-extension: abstracts this well, but adds a layer of magic that makes debugging harder. Better to understand the raw config first.
- Webpack: mature ecosystem for extensions (crxjs), but Vite's speed advantage during dev is significant.

**Key constraint:** Background service worker and content scripts must be flat JS files with predictable paths (manifest.json references them by filename). Vite's `entryFileNames` option in `rollupOptions.output` handles this.

---

## Browser Compatibility

**Decision:** Target Chrome MV3 first, Firefox via `webextension-polyfill`.

**Rationale:**
- MV3 is now required for Chrome Web Store submission.
- Firefox supports MV3 as of Firefox 109, but with some gaps (`chrome.alarms` → `browser.alarms`).
- `webextension-polyfill` bridges the API naming differences cleanly.
- Zen Browser is Gecko-based (Firefox engine) — Firefox build covers it.

**Firefox-specific work deferred to Phase 3:**
- Manifest `browser_specific_settings` block
- Any Firefox-specific permission differences
- Testing pass

---

## Token Estimation Philosophy

**Decision:** Heuristic estimation, not exact counting.

**Rationale:**
- No AI provider exposes real-time token usage in their client-side DOM reliably.
- tiktoken (OpenAI's tokenizer) is a WASM binary — too heavy for a content script.
- Character-to-token ratio of ~4 chars/token is well-established for English text.
- Our goal is directional awareness ("I've used about 60% today"), not precision billing.

**Implemented approach:**
- Observe message send events via MutationObserver
- Measure character length of outgoing messages
- Apply 4-char/token heuristic + 20% overhead for system context
- Track cumulative per session, persist to storage.local

---

## Permissions Philosophy

**Minimum required:**
- `storage` — persist usage data locally
- `alarms` — periodic reset checks

**Explicitly excluded:**
- `tabs` — not needed; content scripts have page context already
- `webRequest` / `declarativeNetRequest` — not intercepting network traffic
- `<all_urls>` — host permissions scoped to only 6 domains
- `cookies` — never
- `history` — never

**Host permissions:** Required for content script injection on HTTPS domains. Scoped to exact supported provider URLs only.
