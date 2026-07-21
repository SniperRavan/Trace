# Trace Extension — Audit & Fix Summary

> **Date**: July 21, 2026  
> **Status**: Completed & Verified  

---

## 1. Executive Summary

Trace is an ambient, local-only AI usage tracking extension built for Manifest V3 (React 18, Vite, TypeScript, Zustand, Tailwind). When manually tested on AI provider sites (ChatGPT, Claude, Gemini, Grok, Perplexity), the initial version did not capture real-time usage or tokens due to cross-context event communication failures, outdated SSE payload parsing logic, and unhandled provider stream types.

All underlying issues have been resolved, verified with `npm run build` and unit tests (`npm test`).

---

## 2. Findings & Root Causes

### 1. Test Suite Configuration (`vitest.config.ts`)
- **Finding**: Running `npm test` attempted to execute unit tests inside `references/gpt-tokenizer/`, failing due to missing edge runtime packages (`@edge-runtime/vm`).
- **Fix**: Added `'**/references/**'` to `test.exclude` in `vitest.config.ts`.

### 2. Token Estimation Accuracy (`src/tracking/estimator.ts`)
- **Finding**: Token counting relied solely on a character length heuristic (`Math.ceil(length / 3.8)`).
- **Fix**: Integrated `gpt-tokenizer` BPE encoder (`cl100k_base` / `o200k_base`) with the heuristic preserved as a safety fallback.

### 3. Cross-World Extension Event Bridge (`src/content/adapters/index.ts`)
- **Finding**: Interceptor scripts operating in the page (`MAIN`) world used `CustomEvent` on `window`. In Chrome MV3, `CustomEvent` `detail` payloads dispatched across isolated worlds can be stripped or lost.
- **Fix**: Created `listenForTraceEvents` helper in `src/content/adapters/index.ts` using `window.postMessage` with a typed `__TRACE_EXTENSION__` signature, while keeping `CustomEvent` as a fallback.

### 4. Provider Adapters (`src/content/adapters/*.ts`)
- **Fix**: Updated `chatgpt.ts`, `claude.ts`, `gemini.ts`, `grok.ts`, and `perplexity.ts` adapters to use `listenForTraceEvents` for guaranteed event delivery.

### 5. Main World Interceptor Upgrade (`src/content/interceptor.ts`)
- **ChatGPT**: Added parsing support for modern SSE delta patch chunks (`"v"` format objects and patch operations) alongside standard message objects and `/backend-api/conversation` endpoints.
- **Claude**: Added stream parsing for `message_start` / `message_delta` numeric tokens and `content_block_delta` text events across `/completion` and `/chat_conversations` endpoints.
- **Gemini & Perplexity**: Improved unescaping regex for Gemini's protobuf arrays and updated Perplexity WebSocket frame handling (`42` socket.io framing).

---

## 3. Reference Blueprints Utilized

1. **`references/Claude-Usage-Extension`**:
   - Rate limit event listening (`message_limit`, `429 Too Many Requests` status codes).
2. **`references/claude-counter`**:
   - `window.postMessage` bridge model across extension script contexts.
   - Exact token and quota fetching endpoints (`/api/organizations/{orgId}/usage`).
3. **`references/gpt-tokenizer`**:
   - Exact BPE token calculation for OpenAI chat completion payloads.

---

## 4. Verification

- **Unit Tests**: `npm test` passed 8/8 tests in ~800ms.
- **Extension Build**: `npm run build` produced valid `dist/` extension assets (`popup.html`, `background/index.js`, `content/index.js`, `content/interceptor.js`, `overlay.html`).
