# 01 — Executive Summary: Final Red Team Swarm

**Engagement:** Final independent red-team of Northstar SellerOS · **Date:** 2026-08-03
**Baseline:** delivery commit `679f2f6` (version a0ea124) · **Final:** `66c5d2b` (version b9c9858)
**Mode:** brutal reality — executable evidence only. Four parallel verifiers, three parallel fix agents, one integration/consolidation pass.

## What was done

1. **4 verifiers** attacked the repo on disjoint axes (security+tenancy, compliance+agents, architecture+database, QA+proof). Every finding required Evidence/File/Line/Severity/Fix. 54 adversarial PoC tests were written and run (not code-reading — live exploitation against the real routers and live MySQL/TiDB).
2. **3 fix agents** remediated every confirmed finding on isolated branches with commit-per-fix discipline; PoCs were flipped into permanent regression tests.
3. **Consolidation** merged all branches (zero conflicts), and the lead independently re-ran the entire battery and flipped the last 7 cross-branch PoC assertions.

## Verdict (from 12_FINAL_SCORE.md): **Pilot Ready** — for a supervised Ontario brokerage pilot on fictional/demo data, with the documented limitations. NOT "Production Ready" (see honest blockers in 10_PRODUCTION_GAP.md and the untested/mocked list).

## Numbers (all independently regenerated)

| Gate | Result |
|---|---|
| `npm run check` (tsc -b) | exit 0 |
| `npm run lint` | exit 0 — 0 errors, 5 documented exhaustive-deps warnings |
| `npm run test` | **248/248** (35 files; baseline 139 → +109 red-team regression/fix tests) |
| `npm run evals` | **131/131 golden (23/23 spec categories) + 85/85 simulator** |
| `npm run build` | exit 0 (known chunk-size warning) |
| `db:seed` ×2 | idempotent, identical entity counts, real blocked-CASL decision persisted |

One observed flake: DB-7 live-DB concurrency probe can hit `ER_DUP_ENTRY` under parallel vitest workers (observed 2× across ~10 full runs; never serially). Documented residual risk, not a silent failure — it fails loudly.

## Findings → fixes (totals)

- **61 findings** across 4 reports (03/04/05/07/08/10).
- **56 FIXED** with regression tests or truthful documentation (see 11_PATCHES.md).
- **5 ACCEPTED/DOCUMENTED** as residual risk with roadmap paths (audit tail-truncation detection, JWT revocation store, DB migrations tooling, router coverage depth, prettier drift).

## What the red team proved holds (attack surface verified, not assumed)

- 22 cross-tenant read/write attacks across 14 routers: all NOT_FOUND/empty. Tenant isolation holds at the application layer.
- All 7 JWT forgery classes rejected (wrong secret, alg=none, RS256 confusion, expired, missing claims, foreign clientId, >7d TTL).
- OAuth state nonce CSRF protection, DNCL called-party timezone, TRESA-08 artifact binding, canonical action hash, autonomy ceiling, tenant-scoped idempotency: re-verified by running their suites.
- Audit hash chain replays verified per tenant on the live DB (row tampering detected at the correct seq).
- Live server boots; unauthenticated tRPC → 401; OAuth flow starts (302 to auth.kimi.com); callback without params → 400.

## What was broken and is now fixed (top items)

- **SEC-2 (HIGH)**: `chooseDemoRole` = arbitrary self-privilege-escalation in any tenant → now restricted to the demo tenant; regression-tested.
- **SEC-3/COMP-5**: any role could close FINTRAC tasks → fintrac_officer only, audited attempts.
- **DB-1/DB-5/DB-7 (HIGH ×3)**: zero FKs → 60 live FKs; zero transactions → atomic write sets on critical paths; audit/event seq race → duplicate-key retry under concurrency.
- **SEC-5/SEC-6/SEC-10**: idempotency squatting across action types, approval replay, forged webhooks — all closed with e2e tests.
- **ARCH-7/GAP-7**: the outbox drainer had **no scheduler** (actions only dispatched via a manual demo call) → interval worker (`DRAINER_INTERVAL_MS`, default 30s) with per-row poison containment.
- **COMP-3**: Quebec contacts silently evaluated under Ontario rules → province tagging + fail-closed jurisdiction check (PIPEDA-07).
- **Documentation layer (the biggest honest-failure class)**: fabricated env-var table (17/17 vars invented), 10 false "as implemented" compliance-matrix rows, 20-agent-journey framing while 3/20 agents were wired, db:push able to prompt-truncate the audit chain — all corrected to verified truth (16 enforced / 12 partial / 16 declared rules).

## Errata recorded

- Red-team report 04_COMPLIANCE.md's summary line (18/14/12) is an arithmetic error; the per-row table computes to **16/12/16**, which is what the corrected compliance-control-matrix carries.
- The compliance verifier's "44 rules" vs "43 rules" discrepancy was already honestly documented (HR-01 taxonomy note).

## Data provenance

All seed, test, and demo data is fictional (Harbourline Realty universe). No real consumer, property, identity, document, contact, or transaction data is used or referenced anywhere in this system. A prior strategic reference to a real property sale as a pilot candidate was removed from all documentation on 2026-08-03 after consent was declined; a full-tree scan confirmed no other occurrences and no personal data of any kind was ever stored.
