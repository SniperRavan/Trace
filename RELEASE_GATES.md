# RELEASE_GATES.md — Trace Production Release Gates & Hardening Matrix

> **Target Version:** 0.2.0 (Release Candidate)  
> **Classification:** Production Gate & Defensive Resiliency Specification  
> **Status:** All Release Gates Implemented & Verified ✅

---

## 1. Executive Summary

Before releasing Trace to users or publishing to the **Chrome Web Store** and **Firefox Add-on Store (AMO)**, every build must satisfy the strict security, privacy, resilience, and manifest validation gates outlined below.

---

## 2. Release Gate Verification Matrix

| Gate # | Requirement | Implementation & Verification Status | Test Verification |
| :--- | :--- | :--- | :--- |
| **Gate 1** | **CI & Automated Quality Checks** | GitHub Actions (`.github/workflows/ci.yml`) runs `type-check`, `npm test`, and `npm run build` on every push/PR. | Automated CI |
| **Gate 2** | **Dual Manifest Validation** | `public/manifest.json` includes valid Chrome MV3 service worker and Firefox `browser_specific_settings` (`gecko.id`). | Verified for MV3 |
| **Gate 3** | **Zero-Knowledge Data Audit** | Verified that raw prompts (`userText`), responses (`assistantText`), cookies, auth headers, and account emails are never written to `chrome.storage.local`. | Audit Passed |
| **Gate 4** | **Source & Confidence Labels** | Every UI metric explicitly displays its source (`server`, `tokenizer`, `heuristic`) and confidence level (`exact`, `estimated`, `unknown`). | Verified in UI |
| **Gate 5** | **Graceful Degradation Matrix** | Unknown models and unhandled RPC formats degrade safely to `estimated` / `unknown` without throwing unhandled exceptions. | Error boundaries tested |
| **Gate 6** | **Independent Feature Flags** | Users can independently toggle tracking on/off for ChatGPT, Claude, and Gemini in the Expanded Panel and Popup without disabling the whole extension. | `toggleProviderEnabled` verified |
| **Gate 7** | **Guarded Import & Size Caps** | JSON import enforces a strict 2MB file size cap, validates schema version (`v2.0`), clamps numeric bounds, and deduplicates `seenEventIds`. | Verified in `store.spec.ts` |
| **Gate 8** | **Storage Schema Migration** | `migrateStorage()` runner safely upgrades older `v1.x` local stores to `v2.0` with backwards compatibility. | Verified in `store.spec.ts` |
| **Gate 9** | **Clean Uninstall Guarantee** | All extension state lives strictly in `chrome.storage.local` with zero persistent filesystem residue or remote telemetry. Uninstalling removes 100% of data. | Native browser guarantee |
| **Gate 10** | **Explicit Scope Disclaimers** | UI and documentation state: *"Tracking: This browser profile only • Zero telemetry"*. | Documented |

---

## 3. Zero-Knowledge Privacy Audit Checklist

```text
[✓] No user message prompts saved to storage
[✓] No model responses saved to storage
[✓] No session cookies or Bearer tokens captured or relayed
[✓] No user emails or account identifiers stored
[✓] Prompts immediately redacted from memory post-tokenization
[✓] Event IDs generated via one-way deterministic hashing
[✓] Zero external telemetry or analytics servers pinged
```

---

## 4. Graceful Degradation & Protocol Drift Matrix

| Scenario | Handled Behavior | Resulting State |
| :--- | :--- | :--- |
| **Unlisted Model** (e.g. newly released LLM) | Falls back to generic tokenizer ratio (~3.8 chars/tok) and default context limit. | `confidence: "estimated"` (no crash) |
| **Interrupted SSE Stream** | Emits `isStreaming: false` with partial observed tokens without finalizing as server-exact. | `confidence: "estimated"` |
| **Renamed Server Usage RPC Key** | Falls back from exact RPC parsing to model tokenizer. | `source: "tokenizer"` |
| **Rate Limit / 429 Status** | Extracts `retry-after` or `x-ratelimit-reset-requests` header and updates reset timer. | `resetAt` updated |
| **Disabled Provider Adapter** | Drops incoming usage events immediately at store ingestion. | No state mutation |
| **Malformed JSON Import** | Rejects import with explicit user-facing error message without corrupting store. | Safe rejection |

---

## 5. Official Release Label

The following wording is the canonical release description for the Chrome Web Store and Firefox Add-on listings:

> **Trace** is a local browser-profile observability extension for AI conversations. It reports provider-supplied usage when exposed and otherwise provides clearly labeled local estimates. It does not promise universal account quota measurement, cross-device tracking, billing accuracy, or mobile-app coverage.
