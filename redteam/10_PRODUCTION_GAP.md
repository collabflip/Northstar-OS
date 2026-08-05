# 10 — Production Gap Report (claims vs reality, independently verified)

Audit worktree: `$HOME/app-redteam-qa` @ a0ea124. Every claim re-tested against code/live DB/running server. Battery details in `08_TEST_RESULTS.md`.

**Headline:** The engineering battery is real (139/139 tests, 131+85 evals reproducible byte-for-byte, seed idempotent, server boots, auth enforced). The **documentation layer is the weak layer**: the deployment guide's env-var table is 100% fabricated, two threat-model mitigations (C5 SSRF, C6 upload validation) have no implementing code, `db:push` is destructive on re-run, there is no CI, and 13 of 21 tRPC routers have zero test coverage.

---

## GAP-1 — Deployment guide §2 env-var table is fabricated (17/17 variables do not exist in code)

- **Evidence:** `grep -rl <VAR> api db src contracts evals scripts` → 0 files for every one of: `OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_ISSUER_URL, APP_URL, MODEL_PROVIDER, MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME, MODEL_DAILY_COST_CAP_CENTS, APP_TIMEZONE, APPROVAL_TTL_HOURS, SEED_DEMO, SECRETS_PROVIDER, UPLOAD_MAX_MB, UPLOAD_QUOTA_MB_PER_TENANT, EGRESS_ALLOWLIST, LOG_LEVEL`.
- **Reality:** code reads `APP_ID, APP_SECRET, DATABASE_URL, KIMI_AUTH_URL, KIMI_OPEN_URL, OWNER_UNION_ID, PORT, NODE_ENV` (`api/lib/env.ts`) plus `MODEL_GATEWAY_API_KEY, MODEL_GATEWAY_BASE_URL, MODEL_GATEWAY_MODEL` (gateway providers). The real reference `.env.example` lists exactly these — and directly contradicts the guide, which claims "the table below is the authoritative reference."
- **File:** `docs/deployment-guide.md:26-45` vs `api/lib/env.ts`, `.env.example`
- **Severity:** HIGH — an operator following the guide cannot configure auth or a live model provider; claimed operational controls (cost cap, egress allowlist, timezone, approval TTL, upload quotas, secrets provider) are not configurable at all.
- **Fix:** Regenerate §2 from `api/lib/env.ts` + `api/gateway/providers.ts`; delete or implement every claimed variable.

## GAP-2 — `npm run db:push` is NOT idempotent on TiDB: re-run demands interactive TRUNCATE of the audit log

- **Evidence:** `npm run db:push </dev/null` → drizzle-kit: *"You're about to add audit_tenant_seq unique constraint to the table, which contains 16 items… Do you want to truncate audit_log table?"* then `Error: Interactive prompts require a TTY terminal`. Push does not apply (logged error; process exit 0 — a silent-failure hazard in CI).
- **Reality:** the live DB **already has** `audit_tenant_seq` UNIQUE(tenantId, seq) (`show index from audit_log`), matching `db/schema.ts:720`. The shipped TiDB patch (`scripts/patch-drizzle-tidb.mjs`) fixes only PK introspection, not unique-constraint introspection, so push forever wants to re-add it.
- **Contradicts:** `docs/deployment-guide.md:82` ("Run `npm run db:push` (idempotent)") and the README quickstart.
- **Severity:** HIGH — answering "yes" truncates `audit_log`, destroying the tamper-evident chain the product advertises; non-interactive deploys cannot run the quickstart step.
- **Fix:** Extend the TiDB patch to unique-index introspection (or ship real migrations + `db:push --force`-free path); add a non-interactive CI check that push is a no-op on a synced DB.

## GAP-3 — Threat model C6 "upload validation" control has no implementing code

- **Claim:** `docs/threat-model.md:14` (C6) — mitigation: "size caps, MIME + magic-byte sniffing, extension/MIME match, per-tenant quota."
- **Reality:** `api/routers/offers.ts:28` `upload` accepts a raw `documentText` **string** via tRPC — there is no binary upload path at all. `grep -rln "magic|%PDF|sniff" api/` → nothing. No per-tenant quota code. Only a global 50MB Hono bodyLimit (`api/boot.ts:13`), which also contradicts the guide's `UPLOAD_MAX_MB=25`. The residual-risk column hedges only the malware scanner, implying the validation exists.
- **Severity:** HIGH (security-documentation honesty) — a claimed preventive control is absent.
- **Fix:** Either implement validated file upload (magic bytes, per-tenant quota, caps) or rewrite C6 to state "text-paste only; no file upload shipped" as the truthful status.

## GAP-4 — Threat model C5 SSRF mitigation ("egress allowlist + URL validation") has no implementing code

- **Claim:** `docs/threat-model.md:13` (C5) — "Egress allowlist in the integration layer; URL validation (scheme, host, no link-local/RFC1918)."
- **Reality:** `grep -rn "RFC1918|link-local|169.254|validateUrl|egress" api/` → only hits are `tool allowlist` in the model gateway (a different control for LLM tools). No URL-fetch validation exists in `api/integrations/` or anywhere else. The guide compounds this with the fake `EGRESS_ALLOWLIST` env var (GAP-1).
- **Severity:** MEDIUM-HIGH — currently latent (no server-side URL fetching shipped), but the documented mitigation is fictional and would matter the moment DDF/media fetching connects.
- **Fix:** Implement an egress URL validator in `api/integrations/` with link-local/RFC1918 rejection + tests, or mark C5 mitigation "not implemented — no outbound fetch shipped."

## GAP-5 — No CI configuration exists

- **Evidence:** no `.github/workflows/`, no `.gitlab-ci.yml`, no `*.yml` CI config anywhere in the repo.
- **Context:** evals/run.ts is explicitly CI-ready (`process.exitCode = 1` on failure, `evals/run.ts:207`); the docs reference "release gates" and CI but nothing is wired.
- **Severity:** MEDIUM — all gates pass locally today, but nothing prevents regression on the next commit; for a "repo-delivered project" this is an honest absence to flag.
- **Fix:** Add a minimal workflow running `check → lint → test → evals → build` (all verified passing in this audit).

## GAP-6 — Test coverage: 13 of 21 tRPC routers at 0% (real v8 coverage measured)

- **Method:** Installed `@vitest/coverage-v8@4` in the disposable audit worktree only (repo untouched); `npx vitest run --coverage --coverage.include='api/**'`.
- **Result:** api/** overall **67.8% stmts / 63.3% branch / 69.2% lines** — but `api/routers` aggregate **21.7% stmts**. Zero-coverage routers: `consents, contacts, conversations, dashboard, dossiers, integrations, pipeline, policy, portal, properties, settings, strategies, workflows`. Partial: approvals 43%, compliance 46%, campaigns 67%, audit 67%, transactions 58%, offers 37%; only valuations 100%. Strong areas: agents 91.5%, policy 90.8% (+packs 100%), workflows 90.5%, gateway 84.1%. Weak: `api/kimi` 51% (platform.ts 12.5%, session.ts 18.8%), `api/lib` 41%, `api/store/drizzle.ts` 49%.
- **Severity:** MEDIUM — the policy kernel is well tested, but most user-facing API surface (13 routers) has no test executing a single line; router-level regressions (tenant scoping bugs in those routers!) would ship silently. Notably `workflows.ts` — the only runtime path that drains the outbox — is untested.
- **Fix:** Add at minimum tenant-isolation + smoke tests per router (the `api/testkit/liveDb.ts` fixture makes this cheap — 5 routers already use it).

## GAP-7 — Outbox drainer does NOT "run in-process" during dev — sends require a manual tRPC call

- **Claim:** `docs/deployment-guide.md:18` — "the outbox drainer runs in-process."
- **Reality:** no drainer loop/interval exists (`grep setInterval/while api/workflows/drainer.ts` → none; `api/boot.ts` starts no drainer). The only runtime invocations are inside `workflows.simulate_restart`-style tRPC procedures (`api/routers/workflows.ts:49,51`), plus seed and evals. Nothing drains automatically after `campaigns.launch` enqueues — a queued campaign sits until a human hits the restart-proof procedure.
- **Severity:** MEDIUM — demo works because the demo script drives the drain manually, but the documented operational model is wrong; on a real deployment nothing would ever send.
- **Fix:** Add an interval drainer to `api/boot.ts` (production) / dev-server hook, or correct the doc to "drain is invoked manually / by the platform worker."

## GAP-8 — `npm run db:migrate` fails out of the box (exit 1, silent)

- **Evidence:** clean checkout state (`db/migrations/` contains only `.gitkeep`): `npm run db:migrate` → spinner "applying migrations..." → exit 1 with **no error message** (verified twice, incl. after removing audit-generated migration files).
- **Severity:** LOW-MEDIUM — broken script in package.json; also undocumented that migrations are not the schema path (push is).
- **Fix:** Either ship an initial migration set or remove/relabel the script; capture drizzle-kit stderr so failures aren't silent.

## GAP-9 — Prettier formatting drift across ~235 files

- **Evidence:** `npx prettier --check .` → "Code style issues found in 238 files" (3 were audit temp files; ~235 repo files incl. `vite.config.ts`, `tsconfig.json`, most of `src/pages/`).
- **Severity:** LOW — `npm run format` works but produces a mega-diff; no format gate exists (see GAP-5).
- **Fix:** One-time `npm run format` commit + CI check.

## GAP-10 — Approval-TTL doc/code contradiction (72h claimed, 48h coded)

- **Claim:** `docs/deployment-guide.md:40` — `APPROVAL_TTL_HOURS` default `72`, "enforced at drain time (ADR-005)".
- **Reality:** `api/policy/engine.ts:399` — `const ttlHours = action.approvalTtlHours ?? 48`; enforced at gate-evaluation time; no env var exists. ADR-005/README "stale approval" tests do exist and pass (evals `stale_approvals` 6/6), so the control is real — only the documentation is wrong.
- **Severity:** LOW.
- **Fix:** Align doc to code (48h, action-overridable) or implement the env var.

## GAP-11 — Minor broken/doc-path references

- `docs/compliance-control-matrix.md:3` references `research/compliance-matrix.md` — **no `research/` directory exists** (likely means `docs/compliance-matrix.md`).
- `README.md:12` and `docs/deployment-guide.md:3` reference `ARCHITECTURE_CONTRACT.md` / `ASSUMPTIONS.md` at repo root — both actually live in `docs/`.
- **Severity:** LOW. **Fix:** correct paths.

## GAP-12 — "List-Unsubscribe / one-click unsubscribe" adapter claim overstated

- **Claim:** `docs/deployment-guide.md:64` — comms adapters ship "email/SMS with one-click unsubscribe + list-unsubscribe."
- **Reality:** `api/integrations/mockComms.ts` is a send-recorder (no headers, no List-Unsubscribe); "one-click unsubscribe" exists only as template narration in `api/agents/CampaignPlanner.ts:39`. The CASL-06 unsubscribe *gate check* does exist in the policy engine (`api/policy/controls.ts`) and is eval-covered (casl_decisions 13/13).
- **Severity:** LOW — acceptable for a labeled mock, but the guide describes adapter capability that isn't there.
- **Fix:** qualify the sentence ("unsubscribe enforced by policy gate; List-Unsubscribe header on live provider only").

---

## Verified-TRUE claims (no gap)

| Claim | Verification |
|---|---|
| 18 files / 139 tests pass | Re-ran: exact match, exit 0 |
| 131/131 golden across 23 categories + 85/85 simulator | Re-ran: exact match; committed `evals/report.md` byte-identical to fresh run except timestamp (reproducible) |
| Spec ≥100 scenarios / ~23 categories | 131 scenarios counted in `evals/golden.ts` across exactly the 23 `EVAL_CATEGORIES`; zero empty categories |
| 5 known lint warnings | Exactly those 5, all exhaustive-deps, 0 errors |
| tsc clean, build ok, chunk warning known | Confirmed |
| Seed idempotent | 4 runs; demo-tenant counts identical across re-seeds on all 15 tables; old tenant row deleted (no accumulation); other tenants untouched |
| Server boots; auth enforced | dist boot ok; `/` 200; `ping` 200; protected queries → 401; OAuth login → 302 to auth.kimi.com; callback w/o params → 400 |
| 20 agents, one contract | `agents.test.ts` asserts exactly 20; contract assertions non-vacuous |
| "43 rules" discrepancy | Honestly disclosed in matrix count note (44 enumerated IDs, HR-01 taxonomy note) |
| verifyAuditChain exists & tested | `api/audit.ts:71`, 15 assertions in `api/audit.test.ts` (no standalone "job" script — restore §5 wording slightly aspirational) |
| No Docker/Temporal needed | Truthful — and indeed no Dockerfile exists; platform-provided runtime |
| Test quality (5 files spot-read) | Adversarial negative cases (cross-tenant, injection, tampered hash chain); no vacuous/tautological assertions found |

---

## Post-remediation errata (2026-08-03, `8dacca0`+)

This section updates the record without rewriting the historical findings above (audited at `a0ea124`).

1. **Finding ledger:** of the 61 red-team findings (all files), **56 are fixed** on master — including all 7 P0s and the proof-layer false-greens — and **5 remain accepted-and-documented residuals**. This report's own gaps were addressed in the fix wave: GAP-1 (fabricated env table) is fixed — `docs/deployment-guide.md` §2 is now generated from code and `.env.example` documents every variable the code reads (verified against `grep -rhoE "process\.env\.[A-Z_]+" api/ src/ scripts/ evals/ db/` on `release-docs`); the drainer interval worker (GAP-7/ARCH-7) is implemented (`api/boot.ts`, `DRAINER_INTERVAL_MS`, default 30000ms).
2. **appr-01 false-green incident (honest account):** the "131/131 golden" row in the Verified-TRUE table above (re-verified at `a0ea124`/`66c5d2b`) was **wrong** — the true result at that commit was **130/131**. Scenario appr-01's fixture approval used a non-canonical payload hash; the gate (correctly, fail-closed) rejected it. Fixture fixed in **`8dacca0`** (`evals/golden.ts`); a fresh run on 2026-08-03 genuinely passes **131/131** (see `evals/report.md` errata). Read any pre-`8dacca0` "131/131" claim — including the headline above — as 130/131 for that commit.
3. **Release-mandate remediation in progress:** P0/P1 items are landing via the `release-*` branches (`release-eng`: `GET /api/livez` + `GET /api/readyz` probes in `api/boot.ts`; `release-docs`: docs-truth sweep + CI pipeline with MySQL service, secret scan, full gates; `release-decon`: fictional-data gate script). The historical "there is no CI" finding (GAP battery) is being discharged by the `release-docs` CI workflow.
4. **Secret rotation = REQUIRED-EXTERNAL:** rotation of `DATABASE_URL` / `APP_SECRET` remains a platform-side obligation (portal-provided values); it cannot be discharged in-repo.
5. **Net effect on the verdict (see 12_FINAL_SCORE.md):** unchanged — **Pilot Ready** for a supervised Ontario demo pilot on unmistakably fictional data, with human approval gates and mock integrations; NOT production ready.
