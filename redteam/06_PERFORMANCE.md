# 06 — Performance

Evidence from `05_ARCHITECTURE.md` (ARCH-1..14) and the fix wave. Status at `66c5d2b`.

## Bundle

| Metric | Value | Status |
|---|---|---|
| `dist/public/assets/index-*.js` | 1,240.62 kB (gzip 328.83 kB) | ACCEPTED with note |
| `dist/public/assets/index-*.css` | 104.99 kB (gzip 17.86 kB) | fine |
| Server bundle `dist/boot.js` | 2.5 MB (esbuild) | fine (server-side) |

- **ARCH-1:** single eager bundle, zero lazy routes. Build emits the Vite chunk-size warning. **Status: ACCEPTED for pilot** — 329 kB gzip is tolerable for an internal brokerage tool on desktop; route-level `React.lazy` splitting is roadmap 30.x. Not hidden: the warning is in the build output and this report.
- **ARCH-2:** ~14 MB unoptimized images in `public/` (generated AI assets). **Status: ACCEPTED for pilot** (local/fast connections); compression pass is a pre-publish checklist item (09_RELEASE_CHECKLIST.md).
- Dead weight: 50/57 shadcn/ui components unreachable, `api/gateway` unused in prod paths (agents are deterministic), 6 unused deps + recharts. Tree-shaking handles the UI side; dep cleanup is roadmap hygiene.

## Query performance (N+1)

| Finding | Before | After |
|---|---|---|
| ARCH-6 `conversations.list` | 2N+1 queries | 2 queries (inArray contacts + grouped messages) — `4410f2f`, tested incl. cross-tenant decoy |
| ARCH-6 `offers.byProperty` | N+1 terms | one inArray SELECT — `4120be4` |
| `offers.upload` term inserts | per-term loop | batched single INSERT — `4120be4` |

Remaining known pattern risk: none observed in other routers (arch verifier's sweep found no other await-in-loop query patterns).

## Concurrency & throughput behavior

- Audit append: duplicate-key retry added (DB-7) — bounded retries, no unhandled errors under parallel writers; residual flake noted in 02_CRITICAL_BUGS C-5.
- Drainer worker: per-tenant sequential cycles every 30s (default), per-row containment — one poison row cannot stall a tenant's queue (`a50b0af`).
- Workflow runner: event-sourced; resume is idempotent (replayWorkflow dedupe); restart-resume verified with zero duplicates in evals (outage_recovery category 131/131).

## Memory & listeners

- Arch verifier: 0 leaked React listeners/intervals across 16 pages; drainer interval uses `timer.unref()` and clears on server close.

## Latency (from evals)

- Eval harness measures decision latency/token/cost categories: latency 3/3, token_usage 3/3, monetary_cost 2/2 — all green under the deterministic mock provider. **Honest note:** these measure pipeline overhead, not live-model latency; real provider latency is unverified (mock gateway default).

## Not measured (honest)

- No load test (>1 concurrent tenant), no production traffic profile, no sourcemap-based bundle attribution. All flagged in 10_PRODUCTION_GAP.md.
