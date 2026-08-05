# Deployment Guide — Northstar SellerOS

Covers: (1) local one-command start, (2) environment variables, (3) Canada-region deployment notes, (4) the swap path to the full-spec production stack (Terraform / Temporal / Postgres), (5) backup, restore, and disaster recovery. Module names per `docs/ARCHITECTURE_CONTRACT.md`; assumptions per `docs/ASSUMPTIONS.md`.

## 1. Local quickstart (one command sequence)

Prerequisites: Node.js ≥ 22.22.0 (required by react-router 8.3.0; CI pins 22.22.0) and npm ≥ 10. **No other services are required** — MySQL is platform-provided (connection string injected via `DATABASE_URL`), all external integrations ship as truthful mocks, and the model gateway defaults to the deterministic mock provider (ADR-004).

```bash
npm install && npm run db:push && npm run db:seed && npm run dev
```

| Step | What it does |
|---|---|
| `npm install` | Installs all workspace dependencies (web `src/`, API `api/`, DB `db/`, contracts `contracts/`, evals `evals/`) |
| `npm run db:push` | Applies the Drizzle schema (`db/schema.ts`) to a **fresh** database — all tables including `workflows`, `workflow_events`, `outbox`, `audit_log`, `policy_packs`, `policy_rules`. See the warning below before ever re-running it |
| `npm run db:seed` | Loads the demo tenant **Harbourline Realty Inc., Brokerage** (Ontario), seeded roles, contacts (the Pelletiers / DEMO-ON-PROPERTY-001, Jonah Whitfield), the Ontario policy pack (`api/policy/packs/on.ts` data), mock integration rows with truthful status, and the demo journey data (dossier, offers, transaction). **Data provenance: all seed, test, and demo data is fictional (Harbourline Realty universe) — no real consumer, property, identity, document, contact, or transaction data is used or referenced anywhere in this system** |
| `npm run dev` | Starts the Hono API (serving tRPC + SPA fallback) and the Vite dev server. **Drainer:** the outbox drainer runs as an in-process interval worker (`api/boot.ts`, `DRAINER_INTERVAL_MS`, default 30000ms; `0` disables) — it drains pending outbox items automatically and resumes workflows after a server restart (regression: `api/boot.drainer.test.ts`, `api/redteam/replayRace.test.ts`; evals `outage_recovery` 3/3) |

Verify: open the app, sign in with the platform OAuth (first login joins the demo tenant with a selectable demo role — labeled demo impersonation), and follow `docs/demo-script.md`. Run the full suite with `npm run test` and evals with `npm run evals` (report: `evals/report.md`).

> ⚠️ **WARNING — `npm run db:push` is NOT idempotent on TiDB.** The shipped TiDB patch (`scripts/patch-drizzle-tidb.mjs`) fixes primary-key introspection but not unique-constraint introspection, so on an already-synced database drizzle-kit wants to re-add `audit_tenant_seq` and prompts: *"Do you want to truncate audit_log table?"* Answering yes **destroys the tamper-evident audit chain**. Non-interactively (CI, piped stdin) the prompt fails with `Interactive prompts require a TTY terminal`, the push does not apply, **and the process still exits 0** — a silent-failure hazard. Rules: run `db:push` once against a fresh database only; **never run it in CI or against production data**; never pass `--force` on a database whose audit trail matters. Re-seeding (`npm run db:seed`) is safe and idempotent — it is scoped to the demo tenant.

> If `db:push` or `db:seed` fails, the only missing prerequisite is `DATABASE_URL` — see §2. No Redis, Docker, Temporal server, or Python is needed for the local build.
>
> **Schema-sync notes (honest, updated 2026-08-03).** Two schema paths now exist: (1) `npm run db:migrate` — committed versioned migrations (`db/migrations/0000_init.sql`, applied via `scripts/db-migrate.mjs`); proven exit 0 on a fresh isolated database, proven a no-op on re-run (table count unchanged, existing `audit_log` rows preserved — never truncated). Use this for fresh and existing databases. (2) `npm run db:push` — drizzle-kit dev-only schema sync for throwaway local databases; subject to the TiDB warning above, never run it against a database whose audit trail matters.

## 2. Environment variables

This table is generated from the code — every row cites the file that reads the variable (`grep -rn "process.env" api/`). `.env.example` mirrors it. "Required" = the server refuses to boot without it **in `NODE_ENV=production`** (`api/lib/env.ts`); in development missing values fall back to empty strings and the mock providers. "Portal-provided" = injected by the delivery platform — you do not set these manually.

| Variable | Read at | Purpose | Required |
|---|---|---|---|
| `APP_ID` | `api/lib/env.ts:11` → `api/kimi/auth.ts` | Kimi OAuth application client ID (authorize + token exchange; also the expected JWT `clientId`) | Production |
| `APP_SECRET` | `api/lib/env.ts:12` → `api/kimi/auth.ts:28`, `api/kimi/session.ts:10` | OAuth client secret **and** session-JWT signing key (dual use — one leak breaks both; rotate together) | Production |
| `DATABASE_URL` | `api/lib/env.ts:14`, `drizzle.config.ts:4` | MySQL/TiDB connection string (app, `db:push`, `db:seed`, live-DB tests) | Production |
| `KIMI_AUTH_URL` | `api/lib/env.ts:15` → `api/kimi/auth.ts:31,46,113` | Kimi OAuth server base URL (token exchange, JWKS, authorize redirect) | Production |
| `KIMI_OPEN_URL` | `api/lib/env.ts:16` → `api/kimi/platform.ts:9` | Kimi Open Platform base URL (profile fetch) | Production |
| `OWNER_UNION_ID` | `api/lib/env.ts:17` | Union ID of the app creator; that user is provisioned with the admin role on first login | Optional |
| `NODE_ENV` | `api/lib/env.ts:5,14` | `production` turns missing required vars into boot failures | Optional (default: development) |
| `PORT` | `api/boot.ts:107` | API listen port | Optional (default `3000`) |
| `MODEL_GATEWAY_BASE_URL` | `api/gateway/providers.ts:47` | OpenAI-compatible endpoint for the live model provider (Kimi K3, Canada-hosted, or self-hosted). Unset → live provider unconfigured; the deterministic mock remains the only provider | Optional |
| `MODEL_GATEWAY_API_KEY` | `api/gateway/providers.ts:48` | Provider key. **Never commit; never place in model context or logs** | Only with live provider |
| `MODEL_GATEWAY_MODEL` | `api/gateway/providers.ts:49` | Model name recorded to `model_calls.modelVersion` alongside `promptVersion` | Optional (default `kimi-k3`) |
| `DRAINER_INTERVAL_MS` | `api/boot.ts:41` | Interval cadence for the in-process outbox drainer worker (default `30000`; `0` disables) | Optional |

**Honest notes.**

- `VITE_APP_ID` / `VITE_KIMI_AUTH_URL` appear in `.env.example` for platform convention but are **not read by the current frontend** — the SPA starts OAuth via the relative path `/api/oauth/login` (`src/pages/Login.tsx`), so no build-time frontend config is required today.
- Approval-freshness TTL is **not** an env var: it defaults to **48 hours** in code (`api/policy/engine.ts:399`, `action.approvalTtlHours ?? 48`), is overridable per action, and is enforced at gate-evaluation time (ADR-005).
- There is no cost-cap, timezone, upload-quota, egress-allowlist, log-level, or secrets-provider env var. Calling-hours windows resolve per the called party's timezone in code (DNCL-04); gateway caps are code constants (`CAPS` in `api/gateway/`); the demo seed is controlled by running `npm run db:seed`, not by a flag.

## 3. Canada-region deployment notes

1. **Data residency.** Deploy the app and MySQL in a Canadian region. PIPEDA-06 requires accountability to follow data to processors: keep the vendor/subprocessor registry (`integrations` + subprocessor registry) current with processing jurisdiction, maintain DPAs with comparable-protection clauses, and disclose cross-border processing in the privacy policy.
2. **Model routing.** Default to the mock or a **Canada-hosted / self-hosted** OpenAI-compatible endpoint. Gateway sensitivity routing sends high-sensitivity tasks only to approved endpoints; provider training opt-out flag is set by default. US-subject processors require a documented risk assessment (CLOUD Act) before enablement — and for Quebec-resident data, a Law 25 PIA must precede any communication of PI outside Quebec (PIPEDA-07 control: QC→US LLM blocked pending PIA).
3. **Timezone.** Calling-hours windows resolve per the **called party's** local timezone in code (DNCL-04, default America/Toronto per ASSUMPTIONS #12 — there is no timezone env var), so multi-province tenants need accurate address/number data.
4. **Bilingual.** EN + fr-CA UI ship with parity tests (`contracts/i18n/`); seeded long-form content is EN-primary (ASSUMPTIONS #10) — plan fr-CA content review before Quebec marketing use.

## 4. Full-spec production swap path (Terraform / Temporal / Postgres)

The local build is production-shaped but substitutes three spec §7 components (ADR-001/002/003). To reach the full-spec target:

| Step | From (local) | To (full spec) | Notes |
|---|---|---|---|
| 1 | Platform MySQL, app-enforced isolation | PostgreSQL + RLS | Drizzle supports both dialects; `db/schema.ts` port + RLS policies keyed to `app.tenant_id`; keep `withTenant(ctx)` as defence-in-depth (ADR-002 hardening). Re-run the cross-tenant leakage suite as the release gate |
| 2 | `api/workflows/` local runner | Temporal cluster | Mapping table in ADR-003 (workflow↔Workflow, outbox↔Activity, drainer↔activity worker). **Keep the commit-time policy gate inside activities** — Temporal must not bypass ADR-005 |
| 3 | In-process interval drainer (`api/boot.ts`, `DRAINER_INTERVAL_MS`) | Dedicated worker deployment | Terraform module: worker service, scaling, alerting on outbox depth/age |
| 4 | Platform runtime | Terraform-managed infra | IaC for network (egress allowlist), database, object storage (uploads), secrets manager, observability (OpenTelemetry per spec §7). Terraform is roadmap (`docs/roadmap.md`) |
| 5 | Mock providers | Live providers | `api/integrations/` adapters are production-shaped with contract tests: comms (email/SMS — unsubscribe is enforced by the policy gate today; one-click unsubscribe + list-unsubscribe header land with the live provider), calendar, listing data (see `docs/licensed-data-onboarding.md`) — flip `integrations.status` only after contract tests pass against sandbox |
| 6 | MockDeterministicProvider | OpenAICompatibleProvider (Kimi K3 / Canada-hosted) | Configuration only (§2). **Re-run `npm run evals` against the live provider and re-approve results** before enabling A2+ autonomy (ADR-004 honesty note) |
| 7 | Retrieval interface (not connected) | pgvector / OpenSearch | Interface exists; connect only with embedding-privacy review (PIPEDA-06) |

Do not change the demo-seed posture (never run `db:seed` against production data), audit-chain verification, or the policy pack versioning process during the swap — they carry over unchanged.

## 5. Backup, restore, and disaster recovery

### Backup

1. **Database:** platform MySQL automated daily snapshots + point-in-time recovery window (confirm both are enabled per environment). The database is the system of record for everything including `workflow_events`, `outbox`, `audit_log`, consent ledger, and the FINTRAC register — no separate file state is authoritative.
2. **Uploads:** offer documents and media in object storage — enable versioning + cross-region replication (Canada region pair).
3. **Configuration:** `.env.example` + settings tables are in the DB; provider secrets are re-issued, not backed up.
4. **Retention interplay:** backups must respect retention/legal-hold rules — a restored snapshot must not resurrect records lawfully destroyed (PIPEDA-03, FIN-08). Restore procedures re-run the retention job before reopening traffic.

### Restore test (quarterly, per spec §11)

1. Restore latest snapshot to an isolated environment.
2. On the isolated restore, apply the schema **only if the snapshot predates it** — and heed the §1 warning: `db:push` is not idempotent on TiDB and may prompt to truncate `audit_log`, which would destroy the very chain this test exists to verify. Then run audit-chain verification (`audit.verifyChain` query); assert no `audit_log` sequence gaps.
3. Boot, sign in, replay `docs/demo-script.md` §worker-restart to prove workflow resume; assert outbox dedupe (no duplicate sends after restore — `idempotencyKey` uniqueness).
4. Record results; a failed restore test is a Sev-2 incident (see `docs/incident-runbooks.md`).

### DR posture

- **RPO:** point-in-time recovery window (platform default; confirm ≥ 24h granularity). **RTO target:** 4 business hours for the app; the fail-closed gate means a down system blocks sends rather than sending unsafely — acceptable by design (ADR-005).
- **Outbox safety on recovery:** pending outbox items re-drain automatically on the next drainer interval tick after restart (`DRAINER_INTERVAL_MS`, `api/boot.ts`); each passes a fresh commit-time policy evaluation, so items whose consent/approval expired during the outage are blocked, not sent late.
- **Breach during DR:** if the incident involves data exposure, invoke the PIPEDA RROSH runbook immediately (`docs/incident-runbooks.md`) — DR activity does not pause breach clocks.
