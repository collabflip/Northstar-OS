# Northstar SellerOS — Architecture Verification (Red Team)

Verifier: ARCHITECTURE + DATABASE adversarial verification. Mode: evidence-only.
Working tree: /mnt/agents/output/app (read-only). Scratch: $HOME/app-redteam-arch.

Status: IN PROGRESS — findings appended incrementally.

## Summary Table (finalized at end)

| ID | Finding | Severity |
|----|---------|----------|

Verification methods: md5 duplicate scan (217+ TS/TSX files), custom import-graph builder + Tarjan cycle detection + entry-reachability (199 modules, static + dynamic imports), dependency-vs-import cross-check (all 60 deps, import-regex + grep fallback), grep hunts for timers/listeners/sync-IO/await-in-loop, dist artifact inspection, live-DB corroboration where relevant. Repo: /mnt/agents/output/app (read-only).

---

## ARCH-1: Single 1.24MB JS bundle, zero code-splitting; stale duplicate bundle in dist
- **Evidence**: `dist/public/assets/` contains `index-BNeUmhzO.js` (1,240,616 B) and `index-De4hngoS.js` (1,232,825 B) — two DIFFERENT builds (`cmp` → DIFFERENT), plus two ~105KB CSS files. `dist/public/index.html` references only `index-BNeUmhzO.js` + `index-CJUcrLxj.css`; the other ~1.3MB are orphan bytes. `vite.config.ts:27-30` sets `emptyOutDir: true` — so the presence of two hashed builds means the shipped dist was assembled from two build runs (assets not cleaned between them). No `manualChunks`, no route-level splitting: `src/App.tsx` statically imports all 22 pages, `grep -c "lazy(" src/App.tsx` → 0. gzip of live bundle: 327KB.
- **File/Line**: vite.config.ts:10-30; src/App.tsx (imports); dist/public/assets/*.
- **Severity**: MEDIUM. 1.24MB (>500KB flag) single chunk for a 22-page app; every page pays full parse cost. Orphan bundle = artifact hygiene defect.
- **Fix**: `React.lazy` per route + `manualChunks` for vendor (framer-motion/radix); rebuild clean dist.
- **Proof**: `ls -la dist/public/assets`; `gzip -c ... | wc -c` → 328121/326644; `grep lazy src/App.tsx` → 0.

## ARCH-2: ~14MB unoptimized images ship in dist/public
- **Evidence**: avatar-*.png 1.2–1.7MB each (6 files ≈ 8.5MB), portal-hero-texture.png 3.2MB, comp-map.png 2.4MB, login-hero.png 2.1MB. Total dist = 23MB, images ≈ 14.4MB vs JS 1.24MB. No image pipeline in vite.config.
- **File/Line**: dist/public/*.png|jpg.
- **Severity**: MEDIUM (page weight dominated by images; Login hero alone 2MB).
- **Fix**: compress/resize (WebP/AVIF), move to CDN/object storage.
- **Proof**: `ls -la dist/public` sizes above.

## ARCH-3: Dead code — 55 source files unreachable from any entry point
- **Evidence**: reachability BFS from entries (src/main.tsx, api/boot.ts, db/seed.ts, evals/run.ts, all *.test.ts) over the full import graph → 55 unreachable non-test files ≈ 170KB source: `src/components/AuthLayout.tsx` (9.3KB — full sidebar/resize UI, superseded by Layout.tsx), `src/components/Footer.tsx`, `src/pages/PageStub.tsx`, `api/lib/http.ts` (fetch-with-timeout helper; gateway/providers.ts reimplements its own abort timer, providers.ts:57), and **50 of 57 shadcn `src/components/ui/*` components** (incl. sidebar.tsx 21.7KB, chart.tsx 10KB, context-menu, carousel, menubar, navigation-menu…). Only `button`/`card` (Login, NotFound) + components imported by dead AuthLayout survive. Cross-checked with grep: zero imports of `components/ui/*` from reachable files except Login/NotFound.
- **File/Line**: listed paths; superseded by src/components/Layout.tsx:12-14.
- **Severity**: LOW-MEDIUM. Tree-shaking keeps them out of the bundle (verified: "recharts" 0 occurrences in dist JS), so runtime impact ≈ 0 — the cost is maintenance illusion (a design system that nothing uses).
- **Fix**: delete unreachable files or wire them in; add ts-prune/knip to CI.
- **Proof**: import-graph reachability script (methodology in header); `grep -rln "components/ui/" src | grep -v ui/` → only AuthLayout(dead)/Login/NotFound.

## ARCH-4: api/gateway (model gateway) is dead in all production paths
- **Evidence**: `grep -rln "gateway" api --include='*.ts' | grep -v test` → no importers of api/gateway outside `api/gateway/gateway.test.ts`. Agents are deterministic rule/regex functions (e.g. api/agents/ConversationalLead.ts:26-33 — keyword regexes, no model call). Live DB `model_calls` table = **0 rows**. docs/ARCHITECTURE_CONTRACT.md:83 describes the model gateway as architecture, but at runtime nothing calls it.
- **File/Line**: api/gateway/{index,controls,providers,types}.ts; api/agents/*.ts.
- **Severity**: LOW (honest scaffolding with tests; but any doc claiming live model calls is wrong — tokens/cost telemetry has never fired).
- **Fix**: either wire agents through gateway or mark it "pre-integration scaffold" in docs.
- **Proof**: grep above; `SELECT COUNT(*) FROM model_calls` → 0.

## ARCH-5: 6 unused runtime dependencies + recharts (dead-code-only)
- **Evidence**: import-regex + grep fallback over api/src/db/contracts/scripts/evals/configs: `@dnd-kit/sortable`, `@dnd-kit/utilities` (only `@dnd-kit/core` used — src/pages/Pipeline.tsx:7-8), `@hookform/resolvers` (react-hook-form used directly — src/components/ui/form.tsx:14), `tw-animate-css` (tailwindcss-animate is the one in tailwind.config.js:124), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (zero references anywhere — offer "documents" are stored as text columns). `recharts` imported only by dead chart.tsx (ARCH-3).
- **File/Line**: package.json dependencies; cited importers.
- **Severity**: LOW (install weight + supply-chain surface; aws-sdk pair is large).
- **Fix**: remove 7 deps.
- **Proof**: per-dep grep outputs; `grep -rn aws-sdk src api db` → empty.

## ARCH-6: N+1 query patterns in routers
- **Evidence**:
  1. `conversations.list` (api/routers/conversations.ts:19-23): per conversation → contact SELECT + last-message SELECT = 2N+1 queries.
  2. `offers.byProperty` (api/routers/offers.ts:20-23): per offer → terms SELECT = N+1.
  3. `offers.upload` (api/routers/offers.ts:47-53): per extracted term → single-row INSERT loop (N round trips, no `db.insert().values([...])` batch, no tx — see DB-5).
  4. Sequential independent awaits (minor): workflows.byId:28-29 (events + outbox), conversations.thread:34-35 (messages + contact) — Promise.all candidates.
- **Severity**: MEDIUM (N small in demo; conversations list is the main inbox view so it scales with tenant chatter).
- **Fix**: join/batch (`inArray` on ids, one terms query for all offers), batch insert.
- **Proof**: cited lines; pattern confirmed by reading both files end-to-end.

## ARCH-7: Outbox drainer has no scheduler — effects only move when a human clicks "simulate restart"
- **Evidence**: `grep -rn drainOutbox api` → callers are tests and `api/routers/workflows.ts:49-51` (inside `simulateRestart`, a demo mutation). `api/boot.ts` has no interval/cron/queue worker. No `setInterval` anywhere in api/ except abort timeouts (gateway/providers.ts:57, lib/http.ts:39 — dead). Consequence: queued/escalated outbox rows never drain in normal operation; `workflows` stuck `waiting` are never swept (compounds DB-6). Drainer also re-runs the FULL policy gate + inserts a NEW policy_decisions row on every attempt of an escalated row that stays pending (drainer.ts:123-131 keeps status pending, attempts+1) — no backoff cap.
- **File/Line**: api/routers/workflows.ts:34-67; api/workflows/drainer.ts:115-131; api/boot.ts (whole file).
- **Severity**: MEDIUM-HIGH (availability of the side-effect pipeline; "durable execution" only advances on manual pokes).
- **Fix**: schedule `drainOutbox` (setInterval/worker) in boot; add stuck-workflow sweeper; backoff on repeated escalates.
- **Proof**: grep caller list above; boot.ts full read.

## ARCH-8: Two parallel data-access layers with duplicated query logic
- **Evidence**: Store contract (`api/store/types.ts`, 293 lines) with Drizzle + Memory impls is used by policy engine/runner/drainer — but **all 20 routers bypass it** and hand-write `getDb()` queries (`grep -rc getDb() api/routers` → 1-6 uses each), re-implementing tenant-scoped lookups the Store already has (e.g. conversations.ts:20 duplicates DrizzleStore.getContact, drizzle.ts:47-54). 15 routers also call getStore() for audit/outbox — so each router mixes both layers ad hoc.
- **File/Line**: api/routers/*.ts vs api/store/drizzle.ts.
- **Severity**: LOW-MEDIUM (inconsistency risk: Store fixes like tenant-scoping won't propagate to hand-written router queries; e.g. offers.verifyTerm:68-70 updates by tenantId+id — correct here, but nothing enforces it).
- **Fix**: move router queries behind Store methods (or drop the Store abstraction); keep one tenancy choke-point.
- **Proof**: grep counts above.

## ARCH-9: Memory-leak / cleanup audit — PASS
- **Evidence**: all 7 `addEventListener` sites have matching `removeEventListener` in effect cleanups (EvidenceDrawer.tsx:46-47, sidebar.tsx:108-109, AuthLayout.tsx:144-152(dead code anyway), use-mobile.ts:13-15, Approvals.tsx:131-132, AuditExplorer.tsx:425-426). Only `setInterval` (OfferRoom.tsx:70-71) has `clearInterval` cleanup. Workflow runner/drainer keep no module-level state (runner is pure per-call; DrizzleStore singleton is stateless besides db pool). Toast `setTimeout`s are fire-and-forget UI (state-set on unmounted component is a no-op in React 18+).
- **Severity**: PASS / INFO.
- **Proof**: grep + file reads cited.

## ARCH-10: Blocking async / missing awaits — mostly PASS, two items
- **Evidence**: (a) `fs.readFileSync(indexPath)` on EVERY SPA-fallback request (api/lib/vite.ts:20) — sync disk read on the event loop per non-API HTML request; no cache. (b) serveStatic root `"./dist/public"` is CWD-dependent (vite.ts:11) — `node dist/boot.js` from any other cwd silently breaks static serving. Missing-await scan: all `appendAudit(`/`enqueueOutbox(` call sites awaited (`grep` verified); no floating promises on critical writes. eslint.config.js has no `no-floating-promises` rule to keep it that way.
- **File/Line**: api/lib/vite.ts:11,20; eslint.config.js.
- **Severity**: LOW.
- **Fix**: cache index.html at boot; `path.resolve(import.meta.dirname, ...)` for root; add typescript-eslint no-floating-promises.
- **Proof**: file read; grep outputs.

## ARCH-11: Duplicate files / circular imports — PASS
- **Evidence**: md5sum scan of all *.ts/tsx (excl. node_modules) → zero duplicate-content files. Import graph (199 modules, static+dynamic+alias-aware) → **0 cycles**. Near-duplicate logic exists (conversations.ts:30-36 vs :43-49 identical conversation+contact+messages fetch; per-router copy-paste of `scoped(ctx)`+tenant-filter boilerplate — by design of tRPC routers, but the 3-line fetch block should be a helper).
- **Severity**: PASS / INFO.
- **Proof**: md5 script output empty; cycle list empty.

## ARCH-12: Minor store-level inefficiencies
- **Evidence**: `appendWorkflowEvent` = 3 round trips/event (max-seq SELECT, INSERT, re-SELECT — api/store/drizzle.ts:298-318); `resumeWorkflow` lists the same event log twice (runner.ts:159 via replay + :162 directly); `workflows.byId` pulls the tenant's ENTIRE outbox then filters by key prefix in JS (routers/workflows.ts:29-30).
- **Severity**: LOW.
- **Fix**: return inserted row from insert (or drop re-select); hoist event list; filter in SQL (`like`/`startsWith`).
- **Proof**: cited lines.

## ARCH-13: Dev introspection plugin in production build path
- **Evidence**: `vite.config.ts:13` applies `plugin-inspect-react-code` (`inspectAttr()`) unconditionally — a dev-only code-inspection plugin (`devDependencies`) with no `mode === "development"` guard. Unverified whether it no-ops in build; if it injects `data-*` attrs it inflates the 1.24MB bundle and leaks source paths.
- **File/Line**: vite.config.ts:13; package.json devDependencies.
- **Severity**: LOW (unverified runtime effect — flagged for confirmation).
- **Fix**: guard with `command === "serve"`.
- **Proof**: vite.config read; plugin has no conditional.

## ARCH-14: Test corroboration
- 12 memory-path test files / 114 tests PASS (runner crash-resume, tenancy, audit chain, agents, gateway, integrations, policy engine/rules/dncl/autonomy, kimi auth) run 2026-08-03 in local worktree. Live-DB test files deliberately not executed (shared DB, read-only constraint).
- No exact-duplicate source files; 0 import cycles (199 modules).

---

## Summary Table

| ID | Finding | Severity |
|----|---------|----------|
| ARCH-1 | Single 1.24MB eager JS bundle, no code-split/lazy routes; stale duplicate bundle+css in dist | MEDIUM |
| ARCH-2 | ~14MB unoptimized PNG/JPG in dist/public (23MB total) | MEDIUM |
| ARCH-3 | 55 unreachable source files (50/57 shadcn ui, AuthLayout, Footer, PageStub, api/lib/http) | LOW-MEDIUM |
| ARCH-4 | api/gateway dead in prod paths; model_calls=0 live; agents are deterministic | LOW |
| ARCH-5 | 6 unused runtime deps + recharts dead-only | LOW |
| ARCH-6 | N+1 in conversations.list (2N+1), offers.byProperty (N+1), per-term insert loop | MEDIUM |
| ARCH-7 | Outbox drainer unscheduled (manual demo mutation only); escalated rows re-gated forever, no backoff | MEDIUM-HIGH |
| ARCH-8 | Routers bypass Store contract — two parallel data-access layers, duplicated tenant-scoped logic | LOW-MEDIUM |
| ARCH-9 | Listener/interval cleanup audit — all clean | PASS |
| ARCH-10 | readFileSync per SPA request; CWD-dependent static root; no floating-promise lint | LOW |
| ARCH-11 | No duplicate files, no circular imports | PASS |
| ARCH-12 | Store round-trip inefficiencies (3 queries/event append; double event list; JS-side outbox filter) | LOW |
| ARCH-13 | plugin-inspect-react-code applied unconditionally (prod build) — effect unverified | LOW |
| ARCH-14 | 114 memory-path tests green | PASS |

## Unverified scope
- Live-DB test suites (would write to shared TiDB).
- plugin-inspect-react-code production behavior (ARCH-13).
- Bundle composition attribution beyond markers (no sourcemaps in dist to analyze).
- Concurrency races (DB-6/DB-7) demonstrated by code trace, not by live fault injection (would require writes).
