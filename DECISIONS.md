# DECISIONS.md — Trace Architectural Decisions

> Tracks why things were built the way they were.
> Prevents revisiting settled questions. Updated each phase.

---

## Observability & Measurement Separation

**Decision:** Strictly separate measurement into three distinct tiers:
1. **Visible Prompt / Response:** Estimated via model tokenizers / calibrated heuristics.
2. **Server-Reported Request Usage:** Exact when provided by native RPC / SSE usage metadata.
3. **Account Quota & Limit Status:** Provider-controlled and dynamic. Labeled as *"Provider dynamic / Unavailable"* rather than inventing a fake token ceiling.

**Alternatives rejected:**
- Synthetic token allowance (`remaining = quota * mult - used`): Consumer AI services (ChatGPT, Claude, Gemini) use dynamic compute, sliding message caps, and hidden throttling rules, not a fixed token wallet. Inventing a synthetic ceiling creates false user expectations and breaks trust.

---

## Modern Multi-Token Accounting

**Decision:** Support multi-token category classification:
- `inputTokens`, `outputTokens`, `reasoningTokens` (o1/o3/Thinking), `cachedInputTokens` (prompt caching), `cacheCreationTokens`.
- Distinct `totalTokens` that reflects true billable load rather than a naive `input + output`.
- **Tokenizer Hierarchy:** Native Server Usage (`exact`) $\rightarrow$ Model Tokenizer (`estimated`) $\rightarrow$ Calibrated Heuristics (`heuristic`). Never apply CJK/code multipliers on top of an actual BPE tokenizer.

---

## MAIN World Security & Event Idempotency

**Decision:** Cryptographic session nonces + deterministic `eventId` hashing + strict payload schema validation.

**Rationale:**
- The interceptor operates in the page's global `MAIN` JavaScript world.
- Host scripts can theoretically observe or dispatch `postMessage` / `CustomEvent` calls.
- The isolated content script rejects any event without the active session nonce, sanitizes all inputs, caps string lengths, and drops duplicate `eventId`s (protecting against React re-renders and stream reconnects).

---

## Cross-Browser & Multi-Device Scope

**Decision:** Honest local-profile boundary (`chrome.storage.local`) with manual encrypted JSON and CSV export/import.

**Alternatives rejected:**
- Pretending `storage.local` provides cross-device tracking: It is physically bound to one browser profile on one machine.
- Mandatory cloud backend sync: Destroys the 100% privacy-first promise of Trace.
- `storage.sync`: Imposes a tiny 100KB limit and leaks usage metadata through browser vendor sync.

---

## Shadow DOM Strategy

**Decision:** Open-mode Shadow DOM, not closed.

**Tradeoff accepted:** Any script running on the host page with `document.querySelector('#trace-root').shadowRoot` can read our DOM. Acceptable — we store nothing sensitive in the DOM and immediately redact prompt text after token calculation.

---

## Dynamic Logo Strategy

**Decision:** Dual vector fallback + Google S2 favicon CDN (`https://www.google.com/s2/favicons?domain=X&sz=64`).
- Embedded SVG vector icons for instant 0ms rendering.
- Blob URL cached in memory.

---

## State Management

**Decision:** Zustand with `chrome.storage.local` persistence and `chrome.storage.onChanged` listener for real-time cross-tab synchronization.
