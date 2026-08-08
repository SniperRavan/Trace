# PROGRESS.md — Trace Development Status

> Last updated: Phase 3 — Observability Layer & Robust Token Accounting
> Purpose: Allow continuation across separate AI conversations.

---

## Current Phase

**Phase 3 — Observability Architecture & Multi-Token Integrity** ✅ COMPLETE

---

## Completed Tasks

### Observability & Measurement Separation
- [x] Three-tier measurement classification: Visible text estimates, Server-reported request usage, Plan Policy quota status.
- [x] Deprecated synthetic remaining token multipliers in favor of honest `PlanPolicy` metadata.
- [x] Dynamic reset countdowns and rolling window tracking (3h ChatGPT, 5h Claude/Gemini).

### Multi-Token Accounting Engine
- [x] Multi-token breakdown: `inputTokens`, `outputTokens`, `reasoningTokens`, `cachedInputTokens`, `cacheCreationTokens`.
- [x] Pure BPE tokenizer (`cl100k_base`) for OpenAI models without corrupting post-multipliers.
- [x] Calibrated heuristics for Claude (~3.5 chars/tok) and Gemini SentencePiece (~4.0 chars/tok) with CJK and code density awareness.

### MAIN World Security & Integrity
- [x] Cryptographic session nonces validating messages from MAIN world transport hooks.
- [x] Deterministic `eventId` hashing (`sha256(provider|reqId|type|path)`) for idempotent deduplication.
- [x] Strict schema validation and bounds sanitization on all cross-world payloads.
- [x] Immediate text redaction after tokenization — zero prompts/replies stored in storage.

### UI & UX Dashboards
- [x] Compact floating HUD overlay displaying observed token totals, conversation context load, and honest quota status.
- [x] Expanded Panel featuring 4 distinct cards (Observed Activity, Conversation Context, Quota & Allowance, Scope & Backup).
- [x] Extension popup supporting Plan Policy selection, theme switching, and local JSON backup/restore.

### Cross-Profile Migration
- [x] One-click JSON and CSV data export.
- [x] JSON import with idempotent `seenEventIds` deduplication for manual profile merging.

---

## Current Status

**Status: Release Candidate — Controlled Beta Ready**

### Automated verification:
- Type checking: passed
- Unit and verification tests: 23 passed
- Production build: passed
- CI pipeline: configured

### Scope:
- Tracks activity observed in the current browser profile
- Uses server-reported usage when available
- Uses labeled estimates when native usage is unavailable
- Does not claim universal provider quota visibility
- Does not include mobile apps or unrelated browser profiles

### Remaining risk:
- Provider web-protocol changes may affect live adapters
- Consumer-provider quota semantics remain provider-controlled
- Manual browser-matrix validation is required before broad publication
