# PROGRESS.md — Trace Development Status

> Last updated: Phase 1 — Architecture Scaffold
> Purpose: Allow continuation across separate AI conversations.

---

## Current Phase

**Phase 2 — Compact Panel + Provider Adapters** ✅ COMPLETE

---

## Completed Tasks

### Project Initialization
- [x] `package.json` — all dependencies defined (React, Vite, TypeScript, Tailwind, Framer Motion, Zustand, webextension-polyfill)
- [x] `vite.config.ts` — multi-entry build: popup, overlay, background, content script
- [x] `tsconfig.json` + `tsconfig.node.json` — strict TypeScript, path aliases (`@/`)
- [x] `tailwind.config.js` — Trace design tokens, provider brand colors, custom keyframes
- [x] `postcss.config.js` — Tailwind + autoprefixer pipeline

### Extension Manifest
- [x] `manifest.json` (MV3) — minimum permissions: `storage`, `alarms`
- [x] Host permissions: only 6 AI provider domains
- [x] Content script matches: ChatGPT, Claude, Gemini, Grok, Perplexity
- [x] No `<all_urls>`, no `tabs`, no `webRequest`

### Shadow DOM Injection
- [x] `src/content/index.ts` — injects `#trace-root` into `<body>`
- [x] Shadow root attached (`open` mode) — CSS fully isolated from host page
- [x] CSS injected via `?inline` import directly into shadow root's `<style>`
- [x] React overlay lazy-loaded via dynamic `import()` — minimal parse cost
- [x] `pointer-events: none` on container shell, restored on interactive elements

### Provider System
- [x] `src/providers/logos.ts` — `PROVIDERS` metadata map (7 providers)
- [x] `FALLBACK_SVGS` — inline SVG strings, instant render, brand-accurate
- [x] `fetchProviderLogo()` — Google S2 favicon CDN, blob URL cache, size validation
- [x] `preloadAllLogos()` — background sequential preload with 100ms delay
- [x] `src/components/ui/ProviderLogo.tsx` — instant SVG → async crossfade swap
- [x] `src/content/providerDetect.ts` — hostname → ProviderId mapping

### State Management
- [x] `src/storage/store.ts` — Zustand store
- [x] `ProviderUsage` type — tokensUsed, tokensTotal, percentUsed, resetAt, messageCount
- [x] Actions: updateUsage, setActiveProvider, toggleOverlay, setExpandedView, setTheme
- [x] 7 providers initialized with conservative defaults (40k token quota)

### Background Service Worker
- [x] `src/background/index.ts` — MV3 compatible
- [x] `chrome.alarms` — hourly reset check registered on install
- [x] Message listener stubs — TRACE_USAGE_UPDATE, TRACE_REQUEST_STATE

### Content Script Adapters
- [x] `src/content/adapters/index.ts` — `ProviderAdapter` interface + factory
- [x] `StubAdapter` — Phase 1 placeholder, logs to console

### CSS / Design System
- [x] `src/overlay/overlay.css` — Trace design tokens as CSS custom properties
- [x] Glass panel base class, liquid progress bar classes, animation keyframes
- [x] Inter font loaded inside shadow root (not leaking to host page)

### Entry Points
- [x] `src/overlay/index.html` + `OverlayApp.tsx` — Phase 1 bubble stub
- [x] `src/popup/index.html` + `popup.tsx` — Phase 1 placeholder popup
- [x] `src/content/overlayMount.ts` — React root → Shadow DOM mount

### Documentation
- [x] `README.md` — project overview, architecture, stack, privacy model, roadmap
- [x] `PROGRESS.md` — this file

---

## Current Status

Extension scaffold is complete and ready to build.

Running `npm install && npm run build` will produce a `dist/` folder loadable as an unpacked Chrome extension. The bubble will appear on supported AI provider pages.

No real tracking occurs yet — all provider adapters are stubs.

---

## Next Immediate Steps (Phase 2)

Priority order:

1. **Floating bubble polish** — Framer Motion spring animations, drag-to-reposition
2. **Compact popup component** — Layer 2 from the visual mockup
3. **ChatGPT adapter** — DOM observer for message sends, quota DOM extraction
4. **Claude adapter** — DOM observer, usage bar parsing if available
5. **Token estimation engine** — `src/tracking/estimator.ts`
6. **Expanded analytics view** — Layer 3, mini sparkline graphs
7. **Theme engine** — CSS variable swapping for Catppuccin / Nord / Tokyo Night
8. **storage.local sync** — persist usage across browser sessions

---

## Blockers

None currently.

---

## Known Decisions Made

See `DECISIONS.md` for full architectural decision log.

Key decisions in Phase 1:
- Shadow DOM `open` mode (not `closed`) — easier debugging, acceptable security tradeoff for a local extension
- Google S2 favicon CDN for dynamic logos — no API key, widely used, reliable
- Blob URL caching for logos — avoids re-fetching across popup open/close cycles
- Zustand over Redux — dramatically less boilerplate, sufficient for this scale
- `?inline` CSS import — only way to get Tailwind into Shadow DOM without a runtime injector
- `webextension-polyfill` — ensures Firefox compatibility without dual codebases
- `open` mode shadow root — enables `shadowRoot` access for Framer Motion portal mounting

---

## Architecture Notes for Resuming

If resuming in a new conversation, provide this file and the project spec.

Key file locations:
- Design tokens: `src/overlay/overlay.css` (CSS vars) + `tailwind.config.js`
- Provider data: `src/providers/logos.ts`
- Global state: `src/storage/store.ts`
- Shadow DOM entry: `src/content/index.ts`
- Overlay root: `src/overlay/OverlayApp.tsx`
- Vite config: `vite.config.ts` (multi-entry, output paths)

The `@/` path alias maps to `src/` in both TypeScript and Vite.
