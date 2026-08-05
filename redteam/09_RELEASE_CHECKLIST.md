# 09 — Release Checklist (Pilot Gate)

Honest status at `66c5d2b`. Legend: ✅ done & evidenced · ⚠️ partial / conditions · ❌ not done (blocker for the stated level).

## A. Engineering gates — ALL ✅

- [x] `npm run check` exit 0
- [x] `npm run lint` exit 0 (5 documented warnings)
- [x] `npm run test` — 248/248 (35 files)
- [x] `npm run evals` — 131/131 golden (23 categories) + 85/85 simulator
- [x] `npm run build` exit 0
- [x] `db:seed` idempotent ×2, fictional data only
- [x] CI config present (`.github/workflows/ci.yml`) — test step gated on `DATABASE_URL` secret

## B. Security — ✅ for pilot

- [x] Tenant isolation: 22 live cross-tenant attacks blocked; store methods tenant-scoped (DB-8)
- [x] JWT forgery classes rejected; clientId bound; 7-day TTL (SEC-9)
- [x] OAuth state nonce CSRF; session cookie SameSite=Lax
- [x] Privilege escalation via demo role closed (SEC-2); FINTRAC officer-only read+write (F3, SEC-3)
- [x] Approval binding: canonical (kind, payload, destination) hash; single-use consumption; conditional decide (SEC-4/6/7)
- [x] Webhook authentication + eventType allowlist + approval binding (SEC-10)
- [x] Audit hash chain verified live per tenant
- [ ] ⚠️ JWT revocation store — roadmap (accepted risk, 7-day TTL bounds exposure)
- [ ] ⚠️ Audit tail-truncation detection — roadmap (accepted; row tampering IS detected)

## C. Compliance (Canada) — ⚠️ conditions for production, ✅ for supervised Ontario pilot

- [x] 16/44 Ontario rules enforced at commit-time gate (tested); 12 partial; 16 declared — matrix states this truthfully
- [x] CASL/DNCL/PIPEDA/FINTRAC/TRESA/HR core flows executable + eval-covered (131 scenarios)
- [x] FINTRAC anti-tipping-off precedence verified (officer-only, BOR cannot bypass)
- [x] Province tagging + fail-closed jurisdiction for non-ON contacts (PIPEDA-07)
- [ ] ❌ **Counsel review of the Ontario policy pack** — `docs/legal-review-checklist.md` VERIFY items outstanding. BLOCKER for production, not for a fictional-data pilot.
- [ ] ❌ BC/AB/QC production packs (fixtures only, honestly labeled; gate fails closed)

## D. Data & operations — ⚠️

- [x] 60 FKs live; critical write sets transactional; idempotency tenant+action scoped
- [x] Drainer interval worker (30s) with poison containment
- [x] Seed/wipe order FK-correct; no destructive migration path (db:push warnings documented)
- [ ] ⚠️ `db:push` non-idempotent on TiDB (truncate-audit_log prompt) — documented; production DDL is manual-only
- [ ] ⚠️ Router test coverage 21.7% lines (13/21 routers at 0% before this wave; workflows now covered) — expand pre-production
- [ ] ❌ No CI run has executed yet (config added this wave) — first run pending

## E. Pre-publish (platform) checklist

- [ ] Compress `public/` images (~14 MB → target <2 MB)
- [ ] Rotate `APP_SECRET` + DB credentials before ANY distribution (dev .env held live creds during the engagement)
- [ ] Confirm `SEED_DEMO`-equivalent demo provisioning is OFF in any non-demo deployment
- [ ] First CI run green on the export ZIP
- [ ] Counsel sign-off path initiated (item C)

## Verdict mapping

- **Fictional-data demo / supervised Ontario pilot:** all blockers cleared → **Pilot Ready**.
- **Production:** blocked on C (counsel + provincial packs), D (coverage, migration tooling), and live-provider/integration validation (see UNTESTED_AND_MOCKED.md).
