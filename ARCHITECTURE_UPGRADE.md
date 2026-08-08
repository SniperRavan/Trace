# ARCHITECTURE_UPGRADE.md — Trace Observability & Token Accounting Specification

> **Version:** 2.0  
> **Status:** Implemented  
> **Core Philosophy:** Privacy-first local usage observability with exact server metrics when available and clearly labeled estimates otherwise.

---

## 1. Executive Summary

Trace is an ambient AI observability layer that runs entirely within the browser extension environment with zero cloud telemetry. This architecture upgrade transitions Trace from a tool with brittle assumptions (synthetic remaining token quotas) to a rigorous, honest, and tamper-resistant observability engine.

### The Three Independent Measurements

| Measurement | Method | Meaning & Confidence |
| :--- | :--- | :--- |
| **Visible Prompt / Response** | Model-specific tokenizer / heuristic | Tokens calculated from text visible to the extension (`estimated`) |
| **Server-Reported Request Usage** | Native API / RPC payload extraction | Exact token counts returned in server headers or payloads (`exact`) |
| **Account Quota & Limit Status** | Plan Policy detection & server reset metadata | Provider-controlled compute/message allowance (`dynamic / unavailable`) |

---

## 2. Key Architecture Pillars

### Pillar 1: No Synthetic Quotas (Plan Policy Model)
Consumer AI web applications (Claude, ChatGPT, Gemini) do not operate on fixed token allowances. They use compute-based sliding windows, message rate limits, and dynamic server-side throttling.

Trace replaces synthetic multiplier math (`remaining = limit * mult - used`) with a **Plan Policy**:
* Explicitly distinguishes quota kinds: `messages`, `compute`, `tokens`, or `unknown`.
* Displays detected reset timers (e.g., 3-hour or 5-hour rolling windows).
* Clearly states **"Quota: Dynamic / Provider-Controlled"** instead of inventing a false token ceiling.

### Pillar 2: Modern Multi-Token Accounting
Modern LLM architectures (e.g., OpenAI o1/o3-mini, Gemini Thinking, Claude with Prompt Caching) feature multi-dimensional token usage:
* `inputTokens` — Raw prompt tokens
* `outputTokens` — Visible generation tokens
* `reasoningTokens` — Hidden thinking/reasoning tokens
* `cachedInputTokens` — Reused prompt cache tokens (discounted)
* `cacheCreationTokens` — Prompt cache creation tokens

**Tokenizer Hierarchy:**
1. **Native Server Usage:** Exact counts extracted from RPC/SSE (`exact`).
2. **Official Model Tokenizer:** BPE encoding (`cl100k_base` / `o200k_base`) without arbitrary post-multipliers (`estimated`).
3. **Calibrated Heuristic:** Provider-tuned character ratios applied only when no tokenizer exists (`heuristic`).

### Pillar 3: MAIN World Security & Event Idempotency
Because the interception hook runs in the page's `MAIN` execution world:
* **Session Nonce:** Every message dispatched to the isolated world includes a cryptographic per-session nonce.
* **Strict Schema Validation:** Payloads are sanitized and validated; unexpected keys and out-of-bound values are rejected.
* **Instant Text Redaction:** Text content is tokenized and discarded immediately. No raw prompts or replies are saved.
* **Event Idempotency (`eventId`):** Hashed from `sha256(provider + requestId + conversationId + eventType + seq)` to prevent duplicate increments during React re-renders, stream retries, or reconnects.

### Pillar 4: Honest Scope & Cross-Context Storage
* `chrome.storage.local` is profile-bound. Trace explicitly informs the user: **"Tracking: This browser profile only"**.
* Cross-tab synchronization is supported natively via `chrome.storage.onChanged`.
* Manual **Encrypted/JSON Export & Import** allows users to merge usage across different browser profiles without cloud sync.

---

## 3. Data Model

```ts
export type TokenSource = 'server' | 'tokenizer' | 'heuristic'
export type TokenConfidence = 'exact' | 'estimated' | 'unknown'
export type QuotaKind = 'messages' | 'compute' | 'tokens' | 'unknown'

export interface UsageRecord {
  provider: ProviderId
  accountKey?: string
  conversationId?: string
  model?: string
  plan?: string
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
  cacheCreationTokens?: number
  totalTokens?: number
  source: TokenSource
  confidence: TokenConfidence
  observedAt: number
}

export interface PlanPolicy {
  provider: ProviderId
  planId: string
  displayName: string
  quotaKind: QuotaKind
  windows: Array<{
    name: 'session' | 'daily' | 'weekly' | 'monthly'
    resetAt?: number
    limit?: number
    unit?: string
    isDynamic?: boolean
  }>
  source: 'provider-ui' | 'provider-response' | 'user-configured'
  observedAt: number
}
```

---

## 4. UI Dashboard Structure

Each provider dashboard displays four distinct cards:
1. **Observed Tokens:** Labeled with `Server reported` (exact) or `Local estimate` (estimated), with breakdown for input, output, reasoning, and cached tokens.
2. **Context Window:** Current conversation load versus detected model context window (e.g., 128k, 200k, 1M).
3. **Detected Quota Status:** Real-time reset countdown and plan metadata (e.g., *"Rolling 5h window — Provider dynamic"*).
4. **Coverage Scope:** Explicit notification that tracking applies to the local browser profile with zero cloud telemetry.
