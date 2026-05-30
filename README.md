# Trace

> An ambient AI usage tracker that lives quietly in your browser.

Trace monitors your daily token and quota consumption across AI providers — ChatGPT, Claude, Gemini, Grok, Perplexity, and more — entirely locally. No cloud, no telemetry, no accounts.

---

## Philosophy

Trace is not an analytics platform. It is a calm, ambient companion.

The design goal is to feel like a native part of the browser — something you glance at, not something you manage. Visually inspired by Arc Browser, Raycast, and macOS Sonoma overlays. Aesthetically rooted in the Linux rice / terminal dashboard tradition (btop, Catppuccin, Nord).

---

## Features (Phase 1)

- Floating ambient bubble overlay — Shadow DOM isolated, zero CSS bleed
- Per-provider branded progress bars (emerald, amber, violet, silver, cyan)
- Dynamic logo loading — instant SVG fallback, seamless swap to real favicons
- Dark theme base with Catppuccin / Nord / Tokyo Night / Gruvbox / Dracula themes
- Manifest V3 — minimal permissions, no remote code execution
- Local-only — no network requests except favicon fetches

---

## Supported Providers

| Provider   | Color  | Domain            |
|------------|--------|-------------------|
| ChatGPT    | Emerald | chatgpt.com      |
| Claude     | Amber  | claude.ai         |
| Gemini     | Violet | gemini.google.com |
| Grok       | Silver | x.com             |
| Perplexity | Cyan   | perplexity.ai     |
| DeepSeek   | Blue   | deepseek.com      |
| Meta AI    | Blue   | meta.ai           |

---

## Architecture

```
trace/
├── src/
│   ├── background/       # Service worker — alarms, storage relay
│   ├── content/          # Content script — Shadow DOM injection, adapters
│   │   └── adapters/     # Per-provider DOM observers
│   ├── overlay/          # Floating bubble + popup (React, Shadow DOM)
│   ├── popup/            # Extension toolbar popup (React)
│   ├── providers/        # Provider metadata + logo system
│   ├── storage/          # Zustand store + browser.storage wrappers
│   ├── themes/           # Theme tokens
│   ├── tracking/         # Token estimation engine
│   ├── animations/       # Framer Motion variants
│   └── components/ui/    # Shared React components
├── public/
│   └── manifest.json     # Chrome MV3 manifest
└── dist/                 # Built extension (load this as unpacked)
```

---

## Tech Stack

| Layer        | Technology                  | Why                                      |
|--------------|-----------------------------|------------------------------------------|
| UI           | React 18 + TypeScript       | Component model, strict types            |
| Build        | Vite 5                      | Fast builds, ?inline imports for CSS     |
| Styling      | Tailwind CSS + CSS vars     | Utility classes + Shadow DOM tokens      |
| Animation    | Framer Motion               | Spring physics, performant               |
| State        | Zustand                     | Minimal, no boilerplate                  |
| Storage      | browser.storage.local       | Extension-native, no DB overhead         |
| Extension    | WebExtension Polyfill       | Chrome + Firefox compatibility           |
| Isolation    | Shadow DOM (open mode)      | Zero CSS bleed between overlay and page  |

---

## Privacy Model

- All processing is local — no external servers
- No chat content is stored — only message counts and token estimates
- No telemetry, no analytics, no crash reporting
- Favicon fetch is the only network request — opt-out planned
- Permissions: `storage`, `alarms`, and host access only to supported AI domains

---

## Setup (Development)

```bash
# Install dependencies
npm install

# Build (watch mode during development)
npm run dev

# Production build
npm run build
```

Then load `dist/` as an unpacked extension in Chrome (`chrome://extensions` → Load unpacked).

---

## Token Estimation Approach

Most AI providers do not expose token APIs publicly. Trace uses:

1. **DOM parsing** — extracts visible quota indicators where available
2. **Heuristic estimation** — tiktoken-style character-to-token ratio (~4 chars/token)
3. **Message length tracking** — cumulative estimate per conversation
4. **Forecasting** — projects daily usage based on hourly rate

Accuracy is approximate by design. The goal is believable, directionally correct estimation — not precision instrumentation.

---

## Roadmap

- [x] Project scaffold (Phase 1)
- [x] Shadow DOM injection
- [x] Logo system (SVG fallback + dynamic swap)
- [x] Zustand store
- [ ] Floating bubble UI (Phase 1)
- [ ] Compact popup (Phase 2)
- [ ] Expanded analytics view (Phase 2)
- [ ] Provider adapters — ChatGPT, Claude (Phase 2)
- [ ] Token estimation engine (Phase 2)
- [ ] Theme switching (Phase 2)
- [ ] Firefox compatibility pass (Phase 3)
- [ ] Remaining providers (Phase 3)
