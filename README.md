<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=10b981&height=120&section=header&text=Trace&fontSize=80&fontColor=ffffff&animation=fadeIn" width="100%" />

# ⚡ Trace

**An ambient AI usage tracker that lives quietly in your browser.**

<p align="center">
  <img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,css,js,html,linux,git,github&theme=dark&perline=10" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Type-Browser%20Extension-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Manifest-MV3-purple?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Providers-7%20AI%20Platforms-emerald?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Local-yellow?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

[![GitHub](https://img.shields.io/badge/GitHub-Source_Code-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/SniperRavan/trace)

</div>

---

## 📸 Preview

|                                       Floating Ambient HUD Overlay                                       |                                         Expanded Analytics Dashboard                                         |
| :------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------: |
| ![Floating Overlay](https://via.placeholder.com/400x250.png?text=Floating+Ambient+HUD+%E2%80%94+Compact) | ![Expanded Dashboard](https://via.placeholder.com/400x250.png?text=Expanded+Dashboard+%E2%80%94+Sparklines) |

|                                       Toolbar Popup Control Panel                                        |                                         Session & Weekly Rate Limits                                         |
| :------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------: |
| ![Toolbar Popup](https://via.placeholder.com/400x250.png?text=Toolbar+Popup+%E2%80%94+Tier+Selector)    | ![Session and Weekly Limits](https://via.placeholder.com/400x250.png?text=Dual+Session+%2B+Weekly+Limits)   |

---

## ✦ About

**Trace** monitors your daily token and quota consumption across AI providers — **ChatGPT**, **Claude**, **Gemini**, **Grok**, **Perplexity**, **DeepSeek**, and **Meta AI** — entirely locally. No cloud, no telemetry, no accounts.

The design goal is to feel like a native part of the browser — something you glance at, not something you manage. Visually inspired by **Arc Browser**, **Raycast**, and **macOS system overlays**. Aesthetically rooted in Linux terminal rice color schemes (**Catppuccin**, **Nord**, **Tokyo Night**, **Gruvbox**, **Dracula**, **Everforest**).

---

## ✨ Core Features

- **🌐 7 Supported AI Providers** — ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, and Meta AI.
- **🛡️ Open-Mode Shadow DOM Isolation** — Attached directly to `<body>` on provider tabs with zero CSS leakage into host web pages.
- **📊 Dual Session & Weekly Limit Tracking** — Live tracking for both session rate limits (e.g. 5-hour window) and weekly cumulative consumption with reset countdowns.
- **⚡ Real-Time Network Interceptor** — MAIN world network hook intercepting fetch, XHR, and WebSocket streams across isolated extension script boundaries via `window.postMessage`.
- **🎯 Dynamic Quota & Subscription Tier Presets** — Toggle between **Free (0.5x)**, **Pro/Plus (1.0x)**, **Team (2.5x)**, and **Enterprise (5.0x)** plans to dynamically scale quota limits.
- **⏱️ Context Window & Prompt Cache Timer** — Live mini context window limit bars (e.g., 200k/128k/1M tokens) and 5-minute prompt cache TTL expiration countdowns.
- **🧮 BPE Tokenization Engine** — Powered by `gpt-tokenizer` (`cl100k_base` / `o200k_base`) with character-ratio fallback (`~3.8 chars/token`).
- **🎨 Custom SVG Sparkline Micro-Charts** — Expanded HUD analytics dashboard with SVG sparklines and theme switcher.
- **🔒 Local-Only & Privacy First** — Zero tracking, zero telemetry.

---

## 🌐 Supported Providers

| Provider   | Color   | Domain              | Context Limit | Session / Weekly Limits | Dynamic Quota Support |
|------------|---------|---------------------|---------------|-------------------------|-----------------------|
| ChatGPT    | Emerald | `chatgpt.com`       | 128,000       | 40k / 200k tokens       | Stream & SSE Intercept |
| Claude     | Amber   | `claude.ai`          | 200,000       | 45k / 300k tokens       | Native `/usage` + SSE |
| Gemini     | Violet  | `gemini.google.com` | 1,000,000     | 60k / 500k tokens       | Protobuf & SSE Meta   |
| Grok       | Silver  | `x.com`             | 128,000       | 25k / 100k tokens       | Stream Budget Parse   |
| Perplexity | Cyan    | `perplexity.ai`     | 128,000       | 20k / 100k tokens       | WebSocket Framing     |
| DeepSeek   | Blue    | `deepseek.com`      | 128,000       | 35k / 150k tokens       | SSE Delta & CoT Parse |
| Meta AI    | Blue    | `meta.ai`           | 128,000       | 30k / 150k tokens       | Content Extraction    |

---

## 🧱 Architecture & Project Structure

```text
trace/
├── src/
│   ├── background/       # Service worker — alarms, storage relay, favicon proxy
│   ├── content/          # Content scripts — Shadow DOM injection, adapters
│   │   ├── adapters/     # Per-provider adapters (ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek, Meta AI)
│   │   ├── interceptor.ts# MAIN world fetch/XHR/WebSocket network hook
│   │   └── providerDetect.ts # Hostname → ProviderId router
│   ├── overlay/          # Floating ambient bubble + Compact & Expanded Panels (React, Shadow DOM)
│   ├── popup/            # Extension toolbar popup dashboard (React)
│   ├── providers/        # Provider metadata + 2-layer logo system (SVG + Favicon CDN)
│   ├── storage/          # Zustand store + chrome.storage.local sync & tier presets
│   ├── tracking/         # Token estimator engine (gpt-tokenizer + fallback ratio)
│   └── components/ui/    # Shared UI components
├── public/
│   └── manifest.json     # Chrome MV3 manifest
├── references/           # Technical blueprint reference projects
└── dist/                 # Built production extension (load unpacked in Chrome)
```

---

## 🛠️ Tech Stack

| Layer        | Technology                  | Why                                      |
|--------------|-----------------------------|------------------------------------------|
| UI           | React 18 + TypeScript       | Component model, strict type safety      |
| Build        | Vite 5                      | Fast builds, multi-entry CSS inline      |
| Styling      | Tailwind CSS + CSS vars     | Utility classes + Shadow DOM tokens      |
| State        | Zustand                     | Minimal, no boilerplate                  |
| Tokenizer    | gpt-tokenizer               | Exact BPE token counting                 |
| Isolation    | Shadow DOM (`open` mode)    | Zero CSS bleed between overlay and page  |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: ≥ 18.x (`node -v`)
- **npm**: ≥ 9.x (`npm -v`)

### Installation & Build

```bash
# 1. Clone the repository
git clone https://github.com/SniperRavan/trace.git
cd trace

# 2. Install dependencies
npm install

# 3. Run type checking & unit tests
npm run type-check
npm test

# 4. Build production extension assets
npm run build
```

### Loading in Browser

1. Open Google Chrome or any Chromium browser (Brave, Edge, Zen).
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the `dist/` directory from the repository.
5. Open any supported AI provider tab (e.g. `claude.ai` or `chatgpt.com`).

---

## 📚 Inspirations & References

Trace builds upon technical blueprints, rate-limiting insights, and tokenization techniques pioneered by open-source projects. Special thanks and credit to:

1. **[Claude Usage Tracker Extension](https://github.com/lugia19/Claude-Usage-Extension)** (`references/Claude-Usage-Extension` by lugia19):
   - Provided blueprints for native Claude organization endpoint querying (`/api/organizations/{orgId}/usage`), rate limit watching (`message_limit`, HTTP 429 status handling), and prompt caching TTL lifetime mechanics.
2. **[Claude Counter](https://github.com/she-llac/claude-counter)** (`references/claude-counter`):
   - Inspired live SSE `message_limit` utilization fraction parsing, 200k context limit visualization, and isolated world message bridging (`window.postMessage` bridge model).
3. **[gpt-tokenizer](https://github.com/niieani/gpt-tokenizer)** (`references/gpt-tokenizer` by niieani):
   - Provided the high-performance BPE tokenizer engine (`cl100k_base` and `o200k_base`) for exact token calculations.

---

## 📬 Contact & Credits

<a href="https://github.com/sniperravan">
  <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
</a>

<div align="center">
  <sub>Built with 💚 by <a href="https://github.com/sniperravan">SniperRavan</a> — An ambient, local-first AI usage companion.</sub>
</div>

<img src="https://capsule-render.vercel.app/api?type=waving&color=10b981&height=80&section=footer" width="100%" />
