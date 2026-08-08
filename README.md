<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=10b981&height=120&section=header&text=Trace&fontSize=80&fontColor=ffffff&animation=fadeIn" width="100%" />

# ⚡ Trace

**Privacy-first local AI usage observability with exact server metrics when available and clearly labeled estimates otherwise.**

<p align="center">
  <img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,css,js,html,linux,git,github&theme=dark&perline=10" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Type-Browser%20Extension-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Manifest-MV3-purple?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Architecture-Observability%20Layer-emerald?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Privacy-100%25%20Local-yellow?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Telemetry-Zero-green?style=for-the-badge" />
</p>

[![GitHub](https://img.shields.io/badge/GitHub-Source_Code-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/SniperRavan/trace)

</div>

---

## ✦ Core Philosophy & Observability Model

Trace is a local ambient observability layer that runs entirely within your browser with **zero cloud telemetry, zero external APIs, and zero user account dependencies**.

Instead of overclaiming private account token allowances or calculating fake remaining quotas, Trace strictly separates token telemetry into three independent measurements:

| Measurement | Method | Meaning & Confidence |
| :--- | :--- | :--- |
| **Visible Prompt / Response** | Model-specific tokenizer / heuristic | Tokens calculated from text visible to the extension (`estimated`) |
| **Server-Reported Request Usage** | Native API / RPC payload extraction | Exact token counts returned in server headers or payloads (`exact`) |
| **Account Quota & Limit Status** | Plan Policy detection & server reset metadata | Provider-controlled compute/message allowance (`dynamic / unavailable`) |

---

## ✨ Key Architectural Features

- **🧮 Multi-Token Classification** — Tracks distinct token categories for modern LLMs:
  - `inputTokens` — Raw prompt tokens
  - `outputTokens` — Visible generation tokens
  - `reasoningTokens` — Hidden thinking tokens (o1, o3-mini, Gemini Thinking)
  - `cachedInputTokens` — Reused prompt cache tokens (Anthropic / Gemini prompt caching)
  - `cacheCreationTokens` — Prompt cache creation tokens
- **🏷️ Honest Labeling & Plan Policy** — Replaces synthetic quota multipliers with real **Plan Policy** metadata:
  - Distinguishes quota types: `messages`, `compute`, `tokens`, or `unknown`.
  - Shows dynamic rolling window countdowns (e.g. 3h/5h sliding resets).
  - Displays *"Quota: Provider dynamic"* instead of inventing an imaginary token ceiling.
- **🚩 Independent Feature Flags** — Allows users to independently enable or pause tracking for ChatGPT, Claude, and Gemini in real-time.
- **🛡️ Hardened Security & Nonce Handshake** — Runs the transport hook in the page's `MAIN` execution world and bridges across to the isolated content script:
  - Cryptographic per-session nonce validation on every message.
  - Strict payload sanitization (rejects unexpected keys, out-of-bound numbers, and oversized strings).
  - Instant text redaction after token counting (never persists raw prompts or responses).
  - Deterministic `eventId` deduplication via `sha256` hashing to prevent duplicate counting on React re-renders or stream reconnects.
- **⏱️ Conversation Context Window Tracking** — Live gauge showing active conversation token load against the model's actual context window (e.g., 128k for GPT-4o, 200k for Claude 3.5/3.7, 1M for Gemini).
- **🔒 Scope & Local Backup** — Explicit scope: **This browser profile only**. Includes one-click encrypted JSON and CSV export/import (size-capped at 2MB with schema versioning) for manual cross-device migration without cloud sync.
- **📦 Dual Browser Support** — Full Manifest V3 compatibility with Chrome and Firefox (`browser_specific_settings`).
- **🎨 Linux Terminal Rice Aesthetics** — Built-in support for beloved developer themes (**Catppuccin**, **Nord**, **Tokyo Night**, **Gruvbox**, **Dracula**, **Everforest**, **Liquid Glass**).

---

## 🛡️ Production Release Gates

Trace enforces 10 strict pre-release validation gates before deployment (detailed in [`RELEASE_GATES.md`](file:///home/sniperravan/Desktop/trace/RELEASE_GATES.md)):
1. **Automated CI/CD**: Full type checking, unit testing, and production builds on GitHub Actions.
2. **Dual Manifest Validation**: Validated for Chrome MV3 and Firefox AMO.
3. **Zero-Knowledge Privacy Guarantee**: Zero prompts, responses, session cookies, or account emails stored.
4. **Graceful Degradation**: Unknown models and interrupted streams degrade safely to labeled estimates.
5. **Schema Versioning**: Backwards-compatible `v2.0` schema with migration runners.

> **Official Release Label:**  
> *"Trace is a local browser-profile observability extension for AI conversations. It reports provider-supplied usage when exposed and otherwise provides clearly labeled local estimates. It does not promise universal account quota measurement, cross-device tracking, billing accuracy, or mobile-app coverage."*

---

## 🧱 Architecture & Project Structure

```text
trace/
├── src/
│   ├── background/       # MV3 service worker (alarms, hourly reset check, logo proxy)
│   ├── content/          # Isolated world content scripts & Shadow DOM mount
│   │   ├── adapters/     # Provider adapters (ChatGPT, Claude, Gemini, Grok, etc.)
│   │   ├── interceptor.ts# MAIN world fetch/XHR/WebSocket network hook
│   │   └── providerDetect.ts # Hostname → ProviderId router
│   ├── overlay/          # Floating ambient HUD & Expanded Dashboard (React, Shadow DOM)
│   ├── popup/            # Extension toolbar popup dashboard (React)
│   ├── providers/        # Provider metadata + 2-layer vector logo system
│   ├── storage/          # Zustand store + chrome.storage.local sync & PlanPolicy
│   ├── tracking/         # Token estimator engine (gpt-tokenizer + calibrated ratios)
│   └── components/ui/    # Reusable glassmorphic UI components
├── public/
│   └── manifest.json     # Chrome MV3 manifest
└── dist/                 # Compiled production extension
```

---

## 🛠️ Tech Stack

| Layer        | Technology                  | Why                                      |
|--------------|-----------------------------|------------------------------------------|
| UI           | React 19 + TypeScript 5.7   | Modern component model, strict type safety |
| Build        | Vite 6                      | Multi-bundle builds, inline CSS          |
| Styling      | Tailwind CSS + CSS vars     | Scoped tokens inside Shadow DOM          |
| State        | Zustand 5                   | Multi-tab sync via chrome.storage.local  |
| Tokenizer    | gpt-tokenizer (cl100k_base) | Exact BPE token counting                 |
| Security     | Session Nonces + Event IDs  | Untrusted MAIN-world bridge isolation    |
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

# 3. Run unit tests & verification suite
npm test

# 4. Build production extension assets
npm run build
```

---

### 🧩 How to Load & Use Trace in Your Browser

1. **Build the extension**:
   ```bash
   npm run build
   ```
2. **Open Extensions Management**:
   - In Chrome/Brave/Edge, navigate to `chrome://extensions`.
3. **Enable Developer Mode**:
   - Turn **Developer mode** toggle switch **ON** in the top-right corner.
4. **Load the `dist` Folder**:
   - Click **Load unpacked** and select the `trace/dist` directory.
5. **Start Tracking**:
   - Navigate to [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), or [Gemini](https://gemini.google.com).
   - Trace will quietly observe and display local metrics in the ambient HUD overlay.

---

## 📬 Contact & Credits

<a href="https://github.com/sniperravan">
  <img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
</a>

<div align="center">
  <sub>Built with 💚 by <a href="https://github.com/sniperravan">SniperRavan</a> — An ambient, local-first AI usage companion.</sub>
</div>
