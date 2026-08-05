# Staging Smoke Battery — Northstar SellerOS wave-2 (independent verifier, 2026-08-03 UTC)

Environment: commit `2e6b579`, fresh throwaway DB `northstar_verify_smoke` (migrated + seeded, **dropped after**), server = production build `node dist/boot.js` on Node **v22.22.0**, `NODE_ENV=production`, PORT 5511. "Staging URL" on this platform = the preview version card; no separate public staging deploy exists.

| # | Smoke item | Measured result | Verdict |
|---|---|---|---|
| 1 | GET `/` | 200 | PASS |
| 2 | GET `/api/trpc/ping` | 200 `{"result":{"data":{"json":{"ok":true,"ts":1785736180823}}}}` | PASS |
| 3 | GET `/api/livez` | 200 `{"status":"ok"}` | PASS |
| 4 | GET `/api/readyz` (SELECT 1 via pool) | 200 `{"status":"ready"}` | PASS |
| 5 | Unauthenticated `/api/trpc/approvals.list` | 401 `{"code":"UNAUTHORIZED","message":"Authentication required"}` | PASS |
| 6 | Unknown route | 404 | PASS |
| 7 | GET `/api/oauth/login` | 302 → `https://auth.kimi.com/api/oauth/authorize?client_id=…&state=…` | PASS |
| 8 | Two-tenant isolation | `tenantEscape.test.ts` 27 tests ✓ (within the 252/252 fresh-DB run) | PASS |
| 9 | Blocked CASL demo | both seed runs print `BLOCKED CASL-03 SMS to Jonah Whitfield (expired consent)` | PASS |
| 10 | Approval single-use | `replayRace.test.ts` 6 tests ✓ (incl. 10-round concurrent double-decide, single winner) | PASS |
| 11 | Restart → zero duplicate sends | SIGTERM → reboot → drainer 35s: outbox **2 before → 2 after** | PASS |
| 12 | Audit-chain verify | `verifyAuditChain()` on smoke DB: `{"ok":true}`, rows=6 | PASS |
| 13 | migrate ×2 + seed ×2 | both migrate exit 0; seed counts identical across runs | PASS |
| 14 | Graceful shutdown | both SIGTERMs log `SIGTERM received — graceful shutdown started` → `shutdown complete`; port closed | PASS |

**14/14 PASS.** All four `northstar_verify_*` databases dropped; no processes left running; verifier cleaned its own temp dirs and env files.

---

## Addendum — deployment-target smoke (2026-08-03, release freeze candidate)

Environment: production build `dist/boot.js` @ commit `4e1414b` (+ docs/smoke-script commit), Node **v22.22.0**, `NODE_ENV=production`, PORT 5577, backed by the **actual provisioned platform database** (TiDB 8.0.11-TiDB-v8.5.3-serverless). Smoke executed via the now-committed reusable battery `scripts/smoke.mjs`:

```
PASS  GET / serves the app shell — 200 + app shell
PASS  GET /api/trpc/ping — 200 ok:true
PASS  GET /api/livez — 200 {"status":"ok"}
PASS  GET /api/readyz (live DB SELECT 1) — 200 {"status":"ready"} — DB reachable from server
PASS  unauthenticated approvals.list is rejected — 401 UNAUTHORIZED
PASS  unknown route returns 404 — 404
PASS  GET /api/oauth/login redirects to Kimi authorize — 302 → oauth/authorize?client_id=…
7/7 PASS (exit 0)
```

Graceful shutdown: SIGTERM → `[boot] SIGTERM received — graceful shutdown started` → `[boot] shutdown complete`, port closed; outbox **2 before → 2 after** (no duplicate sends, none lost). Post-publish, the owner re-runs the identical battery with `node scripts/smoke.mjs --base https://<published-url>` (DEPLOYMENT.md §6).
